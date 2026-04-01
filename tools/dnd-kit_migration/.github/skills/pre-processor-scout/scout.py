import os, json, hashlib, re, datetime

def get_hash(p):
    with open(p, 'r', encoding='utf-8', errors='ignore') as f:
        return hashlib.sha256(f.read().encode('utf-8')).hexdigest()

def analyze_v7():
    # FIX: Résolution absolue du chemin IR
    base_path = os.getcwd()
    ir_p = os.path.join(base_path, '.github', 'IR', 'global.json')

    with open(ir_p, 'r', encoding='utf-8') as f:
        data = json.load(f)

    ir_f = {}
    dep_g = {}

    for r, _, files in os.walk(base_path):
        # Check Negative conditions first to skip irrelevant directories early
        if any(x in r for x in ['node_modules', '.github', 'dnd-react-layout']):
            continue
        # Then check for positive conditions to focus on relevant source directories
        if not any(part in r for part in ['src', 'test']):
            continue

        for f in files:
            if f.endswith(('.ts', '.tsx', '.js', '.jsx')):
                abs_filepath = os.path.join(r, f)
                p = os.path.relpath(abs_filepath, base_path).replace('\\', '/')

                with open(abs_filepath, 'r', encoding='utf-8', errors='ignore') as src:
                    lines = src.readlines()

                # FIX: Filtrage robuste des commentaires via regex (pas de faux positifs sur '*' ou '//')
                raw_content = "".join(lines)
                content = re.sub(r'//.*$', '', raw_content, flags=re.MULTILINE)
                content = re.sub(r'/\*[\s\S]*?\*/', '', content)

                imports = re.findall(r'from\s+[\'\"](.*?)[\'\"]|import\s+.*?from\s+[\'\"](.*?)[\'\"]', content)
                dep_g[p] = [m[0] or m[1] for m in imports if (m[0] or m[1]).startswith('.')]

                # FIX: Classification intelligente des fichiers
                if '/test/examples/' in p:
                    file_type = 'example'
                elif '/test/' in p:
                    file_type = 'test'
                elif '/extras/' in p:
                    file_type = 'extra'
                elif '/legacy/' in p:
                    file_type = 'legacy'
                elif '/core/' in p:
                    file_type = 'core'
                elif '/react/' in p:
                    file_type = 'react_component'
                else:
                    file_type = 'other'

                new_hash = get_hash(abs_filepath)
                existing = data['registry'].get('files', {}).get(p, {})
                preserved_state = existing.get('state', 'discovered') if existing else 'discovered'
                ir_f[p] = {
                    'state': preserved_state,
                    'currentHash': new_hash,
                    'previousHash': existing.get('currentHash'),
                    'hashChanged': existing.get('currentHash') != new_hash,
                    'metadata': {**existing.get('metadata', {}), 'type': file_type},
                    'error_tracking': existing.get('error_tracking', {})
                }

    data['registry']['files'] = ir_f
    data['dependency_graph'] = dep_g

    # SHA-256 déterministe du workspace : concaténation des hashes par-fichier, triés par chemin.
    # Résultat identique si aucun fichier n'a changé entre deux runs — contrairement à time.time().
    sorted_hashes = "".join(v['currentHash'] for k, v in sorted(ir_f.items()))
    workspace_hash = hashlib.sha256(sorted_hashes.encode('utf-8')).hexdigest()

    # Enrichir les métadonnées de global.json
    data['metadata']['workspace_hash'] = workspace_hash
    data['metadata']['scanned_files_count'] = len(ir_f)
    data['metadata']['phase0_completed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    data['metadata']['ast_parser_ready'] = data['metadata'].get('ast_parser_ready', False)

    # 1. Écrire directement dans global.json (source de vérité unique)
    with open(ir_p, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print('✅ Scout V7.26 : {} fichiers découverts, workspace_hash={}'.format(len(ir_f), workspace_hash[:16] + '...'))

    # 3. Rebuilder automatiquement MIGRATION_TRACKER.md via transition.js --sync-only
    import subprocess
    transition_js = os.path.join(base_path, '.github', 'skills', 'state-transitioner', 'transition.js')
    if os.path.exists(transition_js):
        result = subprocess.run(['node', transition_js, '--sync-only'], capture_output=True, text=True)
        if result.returncode == 0:
            print(result.stdout.strip())
        else:
            print('⚠️  Tracker sync failed:', result.stderr.strip())
    else:
        print('⚠️  transition.js introuvable — MIGRATION_TRACKER.md non mis à jour.')

if __name__ == '__main__':
    analyze_v7()
