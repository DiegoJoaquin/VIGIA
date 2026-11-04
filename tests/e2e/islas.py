"""Prueba de punta a punta contra `npm run worker:dev` (http://127.0.0.1:8787, correos en consola).
Verifica registro, equipo, documentos y que dos empresas nunca se vean entre sí.
Uso: python3 tests/e2e/islas.py <archivo de log de wrangler>"""
import hashlib, http.cookiejar, json, os, re, sys, time, urllib.error, urllib.request, uuid

BASE = 'http://127.0.0.1:8787'
LOG = sys.argv[1]
ok = 0

def check(cond, msg):
    global ok
    if not cond:
        print('FALLA:', msg); sys.exit(1)
    ok += 1; print('  ✓', msg)

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar), NoRedirect())
    def req(self, method, path, body=None, form=None, raw=False):
        headers, data = {}, None
        if form is not None:
            boundary = uuid.uuid4().hex
            parts = []
            for k, v in form.items():
                if isinstance(v, tuple):
                    name, content, mime = v
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b'\r\n')
                else:
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
            data = b''.join(parts) + f'--{boundary}--\r\n'.encode()
            headers['content-type'] = f'multipart/form-data; boundary={boundary}'
        elif body is not None:
            data = json.dumps(body).encode(); headers['content-type'] = 'application/json'
        r = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
        try:
            res = self.op.open(r); code, content = res.status, res.read()
        except urllib.error.HTTPError as e:
            code, content = e.code, e.read()
        if raw: return code, content
        try: return code, json.loads(content)
        except Exception: return code, content.decode(errors='replace')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
    def http_error_302(self, req, fp, code, msg, headers):
        return urllib.response.addinfourl(fp, headers, req.full_url, code)

def link_for(email):
    time.sleep(0.6)
    links = re.findall(rf'\[mail\] {re.escape(email)} · .*?\n.*?(http://127\.0\.0\.1:8787/api/auth/verify\?token=\w+)', open(LOG).read(), re.S)
    return links[-1].replace('http://127.0.0.1:8787', '')

def enter(c, email):
    code, _ = c.req('GET', link_for(email))
    check(code in (302, 303), f'{email} entra con su enlace')

def draft(pid, n=3):
    project = {'id': pid, 'name': f'Proyecto {pid}', 'shortName': pid, 'titular': 'X', 'rubro': 'Otro', 'comuna': 'Talca', 'region': 'Maule',
               'instrument': 'DIA', 'rcaLabel': 'RCA', 'sourceUrl': 'https://firma.sea.gob.cl/x.pdf', 'phase': 'Operación', 'trackingStart': '2026-11-01'}
    obs = [{'id': f'o{i}', 'projectId': pid, 'title': f'Compromiso {i}', 'plain': 'x', 'component': 'Agua', 'recipient': 'SMA',
            'frequency': {'kind': 'monthly'}, 'evidence': 'x', 'confirmed': False, 'source': 'rca'} for i in range(n)]
    return {'project': project, 'obligations': obs}

print('Registro')
a, b, carla = Client(), Client(), Client()
code, r = a.req('POST', '/api/auth/request', {'email': 'nadie@ejemplo.cl', 'mode': 'login'})
check(code == 404 and r.get('noAccount'), 'entrar con un correo sin cuenta ofrece crear una')
code, r = a.req('POST', '/api/auth/request', {'email': 'ana@vina-a.cl', 'mode': 'signup', 'name': 'Ana', 'company': ''})
check(code == 400 and r.get('field') == 'company', 'crear cuenta sin empresa marca el campo empresa')
code, r = a.req('POST', '/api/auth/request', {'email': 'ana@vina-a.cl', 'mode': 'signup', 'name': 'Ana Pérez', 'company': 'Viña A'})
check(code == 200, 'Viña A pide su cuenta')
enter(a, 'ana@vina-a.cl')
code, snap = a.req('GET', '/api/snapshot')
check(snap['user']['org'] == 'Viña A' and snap['user']['role'] == 'owner', 'la cuenta queda con el nombre de la empresa y Ana como dueña')
code, r = b.req('POST', '/api/auth/request', {'email': 'ana@vina-a.cl', 'mode': 'signup', 'name': 'Otra', 'company': 'Otra'})
check(code == 200 and r.get('existing'), 'crear cuenta con un correo existente solo manda enlace para entrar')
b.req('POST', '/api/auth/request', {'email': 'bob@aridos-b.cl', 'mode': 'signup', 'name': 'Bob', 'company': 'Áridos B'})
enter(b, 'bob@aridos-b.cl')

print('Proyectos e islas')
code, r = a.req('POST', '/api/import/save', {'draft': draft('rca-1'), 'keep': ['o0', 'o1', 'o2']})
check(code == 200 and r['projectId'] == 'rca-1', 'Viña A importa su RCA')
code, r = b.req('POST', '/api/import/save', {'draft': draft('rca-1'), 'keep': ['o0']})
check(code == 200 and r['projectId'] != 'rca-1', 'Áridos B importa la misma RCA y recibe otro identificador')
pid_b = r['projectId']
_, sa = a.req('GET', '/api/snapshot'); _, sb = b.req('GET', '/api/snapshot')
check([p['id'] for p in sa['projects']] == ['rca-1'] and len(sa['obligations']) == 3, 'Viña A ve solo lo suyo')
check([p['id'] for p in sb['projects']] == [pid_b] and len(sb['obligations']) == 1, 'Áridos B ve solo lo suyo')
ob_a = sa['obligations'][0]['id']
code, _ = b.req('POST', '/api/completions', {'obligationId': ob_a, 'due': '2026-11-30'})
check(code == 404, 'Áridos B no puede marcar compromisos de Viña A')

print('Documentos')
pdf = b'%PDF-1.4\n' + os.urandom(2_300_000)
code, doc = a.req('POST', '/api/documents', form={'projectId': 'rca-1', 'kind': 'resolucion', 'file': ('Resolucion 45.pdf', pdf, 'application/pdf')})
check(code == 200 and doc['size'] == len(pdf), 'Viña A sube una resolución de 2,3 MB')
code, back = a.req('GET', doc['url'], raw=True)
check(code == 200 and hashlib.sha256(back).hexdigest() == hashlib.sha256(pdf).hexdigest(), 'la descarga es idéntica al original (guardado en 3 trozos)')
_, sa = a.req('GET', '/api/snapshot')
check(len(sa['documents']) == 1 and sa['documents'][0]['kind'] == 'resolucion', 'el documento aparece en el proyecto')
check(b.req('GET', doc['url'], raw=True)[0] == 404, 'Áridos B no puede descargar el documento de Viña A')
check(b.req('DELETE', doc['url'])[0] == 404, 'Áridos B no puede borrarlo')
check(b.req('POST', doc['url'] + '/extract')[0] == 404, 'Áridos B no puede leerlo')
code, _ = b.req('POST', '/api/documents', form={'projectId': 'rca-1', 'kind': 'otro', 'file': ('x.pdf', b'%PDF', 'application/pdf')})
check(code == 404, 'Áridos B no puede subir documentos a un proyecto de Viña A')
code, r = a.req('POST', '/api/documents', form={'projectId': 'rca-1', 'kind': 'nada', 'file': ('x.pdf', b'%PDF', 'application/pdf')})
check(code == 400 and r.get('field') == 'kind', 'un tipo de documento inválido marca el campo tipo')
code, r = a.req('POST', doc['url'] + '/extract')
check(code == 500 and 'no está activada' in r['error'], 'sin IA configurada, la lectura avisa con un mensaje claro')
extra = [{**o, 'id': 'res45-' + o['id']} for o in draft('rca-1', 2)['obligations']]
code, r = a.req('POST', '/api/import/save', {'draft': {'project': sa['projects'][0], 'obligations': extra}, 'keep': [o['id'] for o in extra], 'documentId': doc['id']})
_, sa = a.req('GET', '/api/snapshot')
check(len(sa['obligations']) == 5 and sa['documents'][0].get('readAt'), 'los compromisos de la resolución se suman al proyecto y el documento queda como leído')

print('Equipo')
code, r = a.req('POST', '/api/team/invite', {'email': 'bob@aridos-b.cl'})
check(code == 409, 'no se puede invitar a alguien que ya está en otra empresa')
code, r = a.req('POST', '/api/team/invite', {'email': 'carla@vina-a.cl', 'name': 'Carla'})
check(code == 200, 'Ana invita a Carla')
enter(carla, 'carla@vina-a.cl')
_, sc = carla.req('GET', '/api/snapshot')
check([p['id'] for p in sc['projects']] == ['rca-1'] and sc['user']['role'] == 'member', 'Carla ve los proyectos de Viña A como parte del equipo')
check(carla.req('POST', '/api/team/invite', {'email': 'x@vina-a.cl'})[0] == 403, 'Carla no puede invitar (solo la dueña)')
_, team = a.req('GET', '/api/team')
check(len(team) == 2, 'el equipo de Viña A tiene 2 personas')
_, team_b = b.req('GET', '/api/team')
check([m['email'] for m in team_b] == ['bob@aridos-b.cl'], 'Áridos B no ve al equipo de Viña A')
carla_id = [m['id'] for m in team if m['email'] == 'carla@vina-a.cl'][0]
check(b.req('DELETE', f'/api/team/{carla_id}')[0] == 404, 'Áridos B no puede quitar a Carla')
check(a.req('DELETE', f'/api/team/{carla_id}')[0] == 200, 'Ana quita a Carla')
check(carla.req('GET', '/api/snapshot')[0] == 401, 'Carla pierde el acceso al instante')

print('Eliminar cuenta')
check(b.req('DELETE', '/api/org', {'confirm': 'otra cosa'})[0] == 400, 'eliminar pide escribir el nombre exacto')
check(b.req('DELETE', '/api/org', {'confirm': 'Áridos B'})[0] == 200, 'Áridos B elimina su cuenta')
code, r = b.req('POST', '/api/auth/request', {'email': 'bob@aridos-b.cl', 'mode': 'login'})
check(code == 404, 'Bob ya no tiene cuenta')
_, sa = a.req('GET', '/api/snapshot')
check(len(sa['projects']) == 1 and len(sa['documents']) == 1, 'Viña A no se ve afectada')

print('Páginas públicas')
for path, needle in [('/privacidad', 'Política de privacidad'), ('/terminos', 'Términos de uso'), ('/robots.txt', 'Sitemap:'), ('/sitemap.xml', '<urlset')]:
    code, body = a.req('GET', path, raw=True)
    check(code == 200 and needle in body.decode(), f'{path} responde')
code, body = a.req('GET', '/og.png', raw=True)
check(code == 200 and body[:4] == b'\x89PNG', 'la imagen para compartir existe')
code, r = a.req('GET', '/api/no-existe')
check(code == 404 and 'error' in r, 'una ruta de la API que no existe responde 404 en JSON')
print(f'\n{ok} comprobaciones correctas')
