# VIP Ruta Segura · versión real

App para reservar asientos Trujillo ⇄ Chiclayo. Mismo diseño de siempre, pero ahora todo sale de una base de datos Neon (Postgres): cuentas, viajes, asientos, pagos, calificaciones e incidentes.

```
server.js      API (Express) + tareas programadas + sirve la app
db.js          conexión a Neon y migración automática
schema.sql     tablas (se crean solas al arrancar)
services.js    correo por Gmail y validación de DNI (apis.net.pe)
public/        la app (index.html, app.js, sw.js, manifest, íconos)
legacy/        la versión simulada anterior, por si la necesitas
```

## Puesta en marcha

```bash
npm install
```

```bash
copy .env.example .env
```

Llena el `.env` (abajo) y luego:

```bash
npm start
```

Abre http://localhost:3000. Al arrancar crea las tablas y el usuario administrador.

## Variables (`.env`)

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Neon → tu proyecto → **Connection string** (la que termina en `?sslmode=require`) |
| `SESSION_SECRET` | Cualquier texto largo y aleatorio (32+ caracteres) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | El administrador se crea (o se actualiza) solo al arrancar |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Cuenta Gmail con verificación en 2 pasos → https://myaccount.google.com/apppasswords → contraseña de aplicación de 16 letras |
| `APIS_NET_PE_TOKEN` | Token de https://apis.net.pe |
| `APP_URL`, `PORT`, `NODE_ENV` | Opcionales. En producción usa `NODE_ENV=production` |

Sin `GMAIL_*` la app arranca, pero los correos (incluido el código de registro) solo se imprimen en la consola del servidor.

## Qué hace cada punto de tu lista

| # | Requerimiento | Dónde está |
|---|---|---|
| 1 | BD y entorno | `schema.sql` (users, driver_profiles, trips, bookings, booking_seats, payments, reviews, incidents, live_locations, files, email_codes) |
| 2 | Cuentas y 3 roles | Pasajero, chófer y admin. Una misma persona puede ser pasajero y chófer con el mismo correo. El admin sale del `.env` |
| 3 | Código por correo | `/api/auth/code` y `/api/auth/verify`: 6 dígitos, vence en 10 min, 5 intentos |
| 4 | DNI | `/api/dni` consulta apis.net.pe **desde el servidor**; el nombre de la cuenta es el de RENIEC y el DNI no se repite |
| 5 | Aprobaciones del admin | Pestaña **Revisión**: ve selfie, foto del DNI, licencia, SOAT, antecedentes y fotos del vehículo; aprueba o rechaza con motivo. Sin aprobación el chófer no publica |
| 6 | Chófer: viajes | Publicar, editar y cancelar con su precio (S/ 20–120) |
| 7 | Búsqueda | Solo viajes reales; asientos libres y perfil del chófer salen de la BD |
| 8 | Pago Yape/Plin manual | El pasajero ve el número del chófer, paga, sube captura y n.º de operación. El chófer (o el admin) confirma o rechaza. Visa se quitó |
| 9 | QR y abordaje | Boleto con QR; el chófer lo escanea con la cámara (o escribe el código) |
| 10 | Espera y «No presentado» | Una tarea cada 30 s libera: reservas sin pagar (10 min) y pasajeros que no abordaron 20 min después de la salida |
| 11 | Ventas en vivo | Datos reales; las pantallas se actualizan solas cada pocos segundos |
| 12 | Calificaciones | Reales, con promedio calculado; 3 estrellas o menos generan un incidente para el admin |
| 13 | Correos de aviso | Pago por confirmar (al chófer), reserva confirmada o pago rechazado (al pasajero), viaje editado o cancelado, cuenta aprobada o rechazada y SOS (al admin) |
| 14 | Panel admin | Resumen, revisión, usuarios (con bloqueo), pagos, viajes e incidentes |
| 15 | Conectar el prototipo | Toda la simulación (conductores falsos, ventas falsas, reloj acelerado, códigos SMS en pantalla) se eliminó |

El GPS en vivo ahora es real: el celular del chófer transmite su ubicación cada ~8 s mientras el viaje está iniciado y la pantalla **En ruta** está abierta.

## Publicarla

Necesita un servidor Node (no sirve Netlify Drop, que solo aloja archivos). Render, Railway o Fly funcionan: comando de inicio `npm start`, carga las mismas variables, pon `NODE_ENV=production` y `APP_URL` con tu dirección https. La tarea de liberar asientos corre dentro del servidor, así que debe estar encendido (en planes gratuitos que se duermen, también se ejecuta al recibir cualquier petición).

## Lo que conviene saber

- **Token de apis.net.pe:** el servidor lo envía como `Authorization: Bearer <token>` y lee `nombres`, `apellidoPaterno` y `apellidoMaterno`. No pude comprobarlo contra su servicio real; si responde otra cosa, el único lugar a ajustar es `lookupDni` en `services.js`.
- **GPS:** el navegador del chófer solo transmite con la página abierta. Si bloquea el teléfono, se detiene.
- **No incluido** (no estaba en la lista): recuperar contraseña, devoluciones de dinero (el chófer devuelve por su cuenta) y notificaciones push.
- Las fotos y PDF se guardan en la propia BD (máx. 4 MB cada una); solo las ve su dueño, el admin y quien lo necesita (el chófer ve la selfie de sus pasajeros y la captura de su pago).
