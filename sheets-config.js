'use strict';

// Nombres de las pestañas de Google Sheets usadas como tablas del prototipo.
// Los archivos y sus referencias permanecen fuera de esta capa.
const HOJAS = Object.freeze({
  usuarios: 'usuarios',
  codigosCorreo: 'codigos_correo',
  viajes: 'viajes',
  reservas: 'reservas',
  asientosReserva: 'asientos_reserva',
  pagos: 'pagos',
  resenas: 'reseñas',
  incidentes: 'incidentes',
  ubicacionesEnVivo: 'ubicaciones_en_vivo'
});

module.exports = { HOJAS };
