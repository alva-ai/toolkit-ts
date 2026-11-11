import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
import subprocess
from unittest.mock import patch, MagicMock
import urllib.error

import types
import textwrap
workflow=Path(__file__).resolve().parents[1]/'workflows/ci.yml'
lines=workflow.read_text().splitlines()
start=next(i for i,line in enumerate(lines) if 'cat > "$RUNNER_TEMP/toolkit-arc-cache.py"' in line)+1
end=next(i for i in range(start,len(lines)) if lines[i].strip()=='PY')
source=textwrap.dedent('\n'.join(lines[start:end]))
m=types.ModuleType('public_arc_cache')
exec(compile(source,str(workflow),'exec'),m.__dict__)



class CacheTests(unittest.TestCase):
    def test_symlinked_cache_root_never_uploads_external_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();env=dict(RUNNER_TEMP=str(root),BUILD_CACHE_TOOLCHAIN='node18-lock',RUNNER_OS='Linux',RUNNER_ARCH='X64',GITHUB_ENV=str(root/'env'))
            miss=urllib.error.HTTPError('https://cache',404,'cold',{'X-Build-Cache':'authenticated-miss'},None)
            with patch.dict(os.environ,env),patch.object(m,'request',side_effect=miss):m.packages('restore')
            npm=Path((root/'env').read_text().strip().split('=',1)[1]);outside=root/'outside';outside.mkdir();(outside/'unrelated-file').write_text('must-not-upload')
            (npm/'_cacache').symlink_to(outside,target_is_directory=True)
            with patch.dict(os.environ,env),patch.object(m,'request') as upload:
                with self.assertRaises(ValueError):m.packages('save')
                upload.assert_not_called()

    def test_real_seed_retains_receipt_through_checkout_preparation_without_materializing_cached_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();cached=root/'cached';authoritative=root/'authority';workspace=root/'workspace';workspace.mkdir()
            def git(repo,*args):
                return subprocess.check_output(['git','-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-C',str(repo),*args],stderr=subprocess.DEVNULL,text=True).strip()
            for repo,name,text in [(cached,'unverified.txt','unverified cache tree'),(authoritative,'source.txt','authoritative source')]:
                repo.mkdir();git(repo,'init');(repo/name).write_text(text);git(repo,'add',name)
                git(repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Fixture')
            bundle=root/'repository.bundle';git(cached,'bundle','create',str(bundle),'--all');payload=bundle.read_bytes()
            response=MagicMock();response.headers={'Content-Length':str(len(payload))};response.read=io.BytesIO(payload).read
            context=MagicMock();context.__enter__.return_value=response
            with patch.dict(os.environ,RUNNER_TEMP=str(root),GITHUB_WORKSPACE=str(workspace)),patch.object(m,'request',return_value=context):m.seed()
            self.assertEqual('https://github.com/alva-ai/toolkit-ts',git(workspace,'remote','get-url','origin'))
            self.assertEqual('',git(workspace,'ls-files'));self.assertFalse((workspace/'unverified.txt').exists())
            git(workspace,'clean','-ffdx');git(workspace,'reset','--hard','HEAD')
            self.assertTrue((workspace/'.git/cache-seed.receipt').exists())
            expected=git(authoritative,'rev-parse','HEAD');git(workspace,'fetch',str(authoritative),'HEAD');git(workspace,'checkout','--force',expected)
            self.assertEqual(expected,git(workspace,'rev-parse','HEAD'));self.assertEqual('authoritative source',(workspace/'source.txt').read_text())
            self.assertFalse((workspace/'unverified.txt').exists());self.assertTrue((workspace/'.git/cache-seed.receipt').exists())

    def test_restore_rejects_links_escape_credentials_and_unbounded_objects(self):
        for name,kind in [('npm/../../outside',tarfile.REGTYPE),('npm/.npmrc',tarfile.REGTYPE),('npm/_cacache/link',tarfile.SYMTYPE)]:
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory).resolve();archive=root/'test.tar.gz'
                with tarfile.open(archive,'w:gz') as stream:
                    member=tarfile.TarInfo(name);member.type=kind;member.linkname='/outside';stream.addfile(member)
                with self.assertRaises(ValueError):m.unpack(archive,root/'cache')
        response=MagicMock();response.headers={'Content-Length':str(m.LIMIT+1)}
        with self.assertRaises(ValueError):m.download(response,Path('/unused'))

    def test_retry_rewinds_upload_and_refreshes_identity_without_retrying_denial(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'object';file.write_bytes(b'fixture-cache')
            seen=[];opener=MagicMock()
            def open_request(request,timeout):
                seen.append((request.data.read(),request.get_header('X-github-oidc')))
                if len(seen)<3:raise urllib.error.HTTPError('https://cache',503,'busy',{},None)
                return 'success'
            opener.open.side_effect=open_request
            env=dict(GITHUB_REPOSITORY=m.REPOSITORY,GITHUB_REPOSITORY_ID='1204128080',CI_GIT_CACHE_CA_PEM='public-fixture',CHECKOUT_TOKEN='job-fixture')
            with patch.dict(os.environ,env),patch.object(m.ssl,'create_default_context'),patch.object(m.urllib.request,'build_opener',return_value=opener),patch.object(m,'identity',side_effect=['oidc1','oidc2','oidc3']),patch.object(m.time,'sleep'):
                with file.open('rb') as stream:self.assertEqual('success',m.request('/build-cache/fixture',method='PUT',data=stream))
            self.assertEqual([b'fixture-cache']*3,[v[0] for v in seen]);self.assertEqual(['oidc1','oidc2','oidc3'],[v[1] for v in seen])
            opener.open.side_effect=urllib.error.HTTPError('https://cache',403,'denied',{},None)
            with patch.dict(os.environ,env),patch.object(m.ssl,'create_default_context'),patch.object(m.urllib.request,'build_opener',return_value=opener),patch.object(m,'identity',return_value='oidc') as identity:
                with self.assertRaises(urllib.error.HTTPError):m.request('/build-cache/fixture')
                self.assertEqual(1,identity.call_count)

    def test_only_authenticated_miss_is_cold_and_save_selects_npm_objects(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();env=dict(RUNNER_TEMP=str(root),BUILD_CACHE_TOOLCHAIN='node18-lock',RUNNER_OS='Linux',RUNNER_ARCH='X64',GITHUB_ENV=str(root/'env'))
            miss=urllib.error.HTTPError('https://cache',404,'cold',{'X-Build-Cache':'authenticated-miss'},None)
            with patch.dict(os.environ,env),patch.object(m,'request',side_effect=miss):m.packages('restore')
            npm=Path((root/'env').read_text().strip().split('=',1)[1]);(npm/'_cacache').mkdir();(npm/'_cacache/object').write_text('verified-data');(npm/'.npmrc').write_text('must-not-upload')
            def upload(path,method,data):
                with tarfile.open(fileobj=data,mode='r:gz') as stream:
                    self.assertEqual(['npm/_cacache/object'],stream.getnames())
                response=MagicMock();response.__enter__.return_value.status=204;return response
            with patch.dict(os.environ,env),patch.object(m,'request',side_effect=upload):m.packages('save')
            denied=urllib.error.HTTPError('https://cache',404,'unconfigured',{},None)
            with patch.dict(os.environ,env),patch.object(m,'request',side_effect=denied):
                with self.assertRaises(ValueError):m.packages('restore')


if __name__=='__main__':unittest.main()
