#!/usr/bin/env python3
"""Preserva recursos de releases para abas abertas antes de um deploy."""
from pathlib import Path
import hashlib,os,shutil,sys,tempfile

def preservar(release, destino):
    release,destino=Path(release),Path(destino)
    copied=0
    for folder in ('assets','static'):
        origin=release/folder
        if not origin.is_dir(): continue
        for src in origin.rglob('*'):
            if not src.is_file(): continue
            rel=src.relative_to(release)
            target=destino/rel
            if target.exists():
                if hashlib.sha256(src.read_bytes()).digest()!=hashlib.sha256(target.read_bytes()).digest():
                    raise RuntimeError(f'Recurso com mesmo nome e conteúdo diferente: {rel}')
                continue
            target.parent.mkdir(parents=True,exist_ok=True)
            fd,tmp=tempfile.mkstemp(prefix='.publish-',dir=target.parent)
            try:
                with os.fdopen(fd,'wb') as f:
                    with src.open('rb') as source: shutil.copyfileobj(source,f)
                    f.flush();os.fsync(f.fileno())
                os.chmod(tmp,0o644)
                os.replace(tmp,target)
                copied+=1
            finally:
                if os.path.exists(tmp):os.unlink(tmp)
    return copied

if __name__=='__main__':
    print(f'Recursos preservados: {preservar(sys.argv[1],sys.argv[2])}')
