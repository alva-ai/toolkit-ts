import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
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
