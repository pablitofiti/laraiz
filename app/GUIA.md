# La raíz · guía rápida

## Abrir en el PC (hoy)
1. Doble clic en `abrir.bat` (necesita Python instalado). Se abre el navegador en `http://localhost:8000/app/`.
2. La primera vez pulsa **Vincular raiz.json** y elige `Dropbox/00_APP TD/raiz.json`. A partir de ahí, cada cambio se escribe en ese archivo (Chrome o Edge).
   - Si no vinculas nada, la app lee `../raiz.json` y guarda los cambios solo en el navegador. **Descargar copia** te da el JSON para sustituirlo a mano.

## Reglas del árbol
- Estados: bloqueado (rayado) → disponible (blanco) → activo (amarillo) → hecho (verde).
- Solo un cuadro activo por raíz; solo un paso activo por cuadro.
- Al marcar hecho, el siguiente del mismo padre se desbloquea.
- Solo un nodo activo se puede desglosar (+ paso).

## Sincronizar con móvil y tablet (Dropbox)
1. Entra en https://www.dropbox.com/developers/apps → **Create app** → Scoped access → **Full Dropbox** → nombre `laraiz`.
2. En *Permissions* marca `files.content.read` y `files.content.write`. Guarda.
3. En *Settings* → *Redirect URIs* añade `http://localhost:8000/app/` y, cuando publiques la app, también su URL.
4. Copia la **App key** y pégala en `config.js` (`appKey: "..."`).
5. En la app pulsa **Conectar Dropbox** y acepta. Cada dispositivo se conecta una vez.

## Publicar (para instalarla en el móvil)
- Netlify Drop (https://app.netlify.com/drop): arrastra la carpeta `app`. Te da una URL; añádela a los Redirect URIs de Dropbox.
- En el móvil, abre la URL y "Añadir a pantalla de inicio".

## Archivo
Todo vive en `raiz.json`. Claude puede leerlo y reescribirlo desde el chat con Dropbox conectado para desglosar nodos.

## Claude dentro (v2.0)
1. Crea una clave en https://platform.claude.com/settings/keys y carga saldo en Billing.
2. En la app: Ajustes → Claude → pega la clave → Guardar. Queda solo en ese dispositivo.
3. Botón "Claude" (arriba a la derecha, o en la barra del móvil). Escribe, adjunta PDF/imagen si hace falta, Enviar (Ctrl+Enter).
4. Si propone cambios, los ves en una lista y pulsas Aplicar o Descartar. Nada se escribe sin tu ok.
