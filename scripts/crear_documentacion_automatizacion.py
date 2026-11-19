from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


ROOT = Path(__file__).resolve().parents[1]
CAPTURAS = ROOT / "capturas_automatizacion"
SALIDA = ROOT / "documentacion_automatizacion_vip_ruta_segura.docx"
CAPTURAS.mkdir(exist_ok=True)


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
    ]
    path = next((p for p in candidates if p.exists()), None)
    return ImageFont.truetype(str(path), size) if path else ImageFont.load_default()


F_TITLE = font(34, True)
F_SUB = font(22, True)
F_BODY = font(19)
F_SMALL = font(16)
F_MONO = font(17)
F_HEADER = font(18, True)


def rounded(draw, box, fill, outline=None, radius=14, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def title_bar(draw, title, subtitle):
    draw.rectangle((0, 0, 1600, 90), fill="#6f2dbd")
    draw.text((34, 20), title, fill="white", font=F_TITLE)
    draw.text((35, 58), subtitle, fill="#eadcff", font=F_SMALL)


def save_webhook():
    im = Image.new("RGB", (1600, 900), "#f4f5f7")
    d = ImageDraw.Draw(im)
    title_bar(d, "01 Webhook recibe datos", "Make · Integración Make - Hojas de cálculo")
    rounded(d, (45, 125, 1555, 820), "white", "#d8dce3", 16)
    d.text((85, 160), "Entrada de la automatización", fill="#222222", font=F_SUB)
    rounded(d, (90, 225, 1510, 365), "#fff8e8", "#e6c76b", 12)
    d.text((125, 250), "Webhook personalizado", fill="#6a4b00", font=F_HEADER)
    d.text((125, 292), "vip-ruta-segura-api", fill="#222222", font=F_MONO)
    d.text((125, 330), "Recibe un JSON con el campo tabla y los datos de la solicitud.", fill="#444444", font=F_BODY)
    rounded(d, (95, 420, 820, 750), "#eef7ff", "#acd3f4", 12)
    d.text((130, 450), "Payload sintético probado", fill="#15517b", font=F_HEADER)
    payload = [
        '{',
        '  "tabla": "usuarios",',
        '  "request_id": "demo-usuario-001",',
        '  "status": "pendiente",',
        '  "message": "Solicitud sintética de prueba",',
        '  "passenger_count": 2',
        '}',
    ]
    y = 500
    for line in payload:
        d.text((130, y), line, fill="#222222", font=F_MONO)
        y += 34
    rounded(d, (900, 420, 1500, 750), "#effaf2", "#a7d9b5", 12)
    d.text((935, 450), "Resultado", fill="#176b2d", font=F_HEADER)
    d.text((935, 515), "OK  JSON recibido", fill="#176b2d", font=F_BODY)
    d.text((935, 565), "OK  Campo tabla detectado", fill="#176b2d", font=F_BODY)
    d.text((935, 615), "OK  Listo para enrutar", fill="#176b2d", font=F_BODY)
    d.text((935, 685), "El escenario permanece inactivo", fill="#555555", font=F_SMALL)
    im.save(CAPTURAS / "01_webhook_recibe_datos.png")


def save_router():
    im = Image.new("RGB", (1600, 900), "#f4f5f7")
    d = ImageDraw.Draw(im)
    title_bar(d, "02 Enrutamiento por tabla", "Make · Router If-else")
    rounded(d, (45, 125, 1555, 820), "white", "#d8dce3", 16)
    d.text((85, 160), "El campo tabla decide la hoja de destino", fill="#222222", font=F_SUB)
    rounded(d, (100, 390, 340, 520), "#f2a900", "#bd8000", 22)
    d.text((142, 425), "Webhook", fill="white", font=F_HEADER)
    d.text((140, 465), "JSON", fill="white", font=F_BODY)
    rounded(d, (580, 335, 930, 575), "#68c94b", "#419f2a", 22)
    d.text((665, 380), "If-else", fill="white", font=F_SUB)
    d.text((650, 430), "tabla = ?", fill="white", font=F_BODY)
    d.text((650, 480), "9 ramas", fill="white", font=F_BODY)
    d.line((340, 455, 580, 455), fill="#9aa0a8", width=8)
    d.polygon([(580, 455), (550, 440), (550, 470)], fill="#9aa0a8")
    hojas = ["usuarios", "codigos_correo", "viajes", "reservas", "asientos_reserva", "pagos", "reseñas", "incidentes", "ubicaciones_en_vivo"]
    ys = [170, 240, 310, 380, 450, 520, 590, 660, 730]
    for name, y in zip(hojas, ys):
        d.line((930, 455, 1120, y + 25), fill="#83d5a0", width=4)
        rounded(d, (1120, y, 1510, y + 50), "#e9f8ef", "#72c68f", 10)
        d.text((1145, y + 13), name, fill="#176b2d", font=F_SMALL)
    d.text((110, 780), "Cada solicitud llega a una sola rama y se descartan valores tabla no reconocidos.", fill="#555555", font=F_BODY)
    im.save(CAPTURAS / "02_enrutamiento_por_tabla.png")


def save_sheets():
    im = Image.new("RGB", (1600, 900), "#f4f5f7")
    d = ImageDraw.Draw(im)
    title_bar(d, "03 Hojas de Google Sheets", "Vip ruta segura · Tablas en español")
    rounded(d, (45, 125, 1555, 820), "white", "#d8dce3", 16)
    d.text((85, 160), "Cada rama usa Google Sheets Add a Row", fill="#222222", font=F_SUB)
    hojas = ["usuarios", "codigos_correo", "viajes", "reservas", "asientos_reserva", "pagos", "reseñas", "incidentes", "ubicaciones_en_vivo"]
    x0, y0, w, h = 90, 245, 460, 92
    for i, name in enumerate(hojas):
        x = x0 + (i % 3) * 500
        y = y0 + (i // 3) * 145
        rounded(d, (x, y, x + w, y + h), "#e9f3ff", "#9cc5ec", 12)
        d.text((x + 24, y + 18), name, fill="#15517b", font=F_HEADER)
        d.text((x + 24, y + 54), "Hoja / tabla transaccional", fill="#4a5f70", font=F_SMALL)
    rounded(d, (90, 700, 1510, 780), "#effaf2", "#a7d9b5", 10)
    d.text((120, 724), "No se trasladan campos de archivos ni contraseñas al flujo de Sheets.", fill="#176b2d", font=F_BODY)
    im.save(CAPTURAS / "03_hojas_google_sheets_en_espanol.png")


def save_result():
    im = Image.new("RGB", (1600, 900), "#f4f5f7")
    d = ImageDraw.Draw(im)
    title_bar(d, "04 Prueba exitosa en usuarios", "Google Sheets · Vip ruta segura")
    rounded(d, (45, 125, 1555, 820), "white", "#d8dce3", 16)
    d.text((85, 160), "Resultado observado después de ejecutar la prueba", fill="#222222", font=F_SUB)
    d.text((90, 225), "Pestaña activa: usuarios", fill="#15517b", font=F_HEADER)
    cols = [(90, "id"), (340, "email"), (590, "dni"), (840, "name"), (1090, "phone"), (1340, "pass_hash")]
    for x, label in cols:
        d.rectangle((x, 285, x + 230, 345), fill="#e8edf3", outline="#b9c3cf", width=2)
        d.text((x + 15, 305), label, fill="#222222", font=F_SMALL)
    for x, label in cols:
        d.rectangle((x, 345, x + 230, 405), fill="white", outline="#b9c3cf", width=2)
        value = "demo-usuario-001" if label == "id" else ""
        if value:
            d.text((x + 15, 365), value, fill="#222222", font=F_SMALL)
    d.text((90, 485), "OK  1 fila agregada", fill="#176b2d", font=F_SUB)
    d.text((90, 540), "OK  La rama usuarios fue la única ejecutada", fill="#176b2d", font=F_BODY)
    d.text((90, 590), "OK  No hubo errores", fill="#176b2d", font=F_BODY)
    d.text((90, 640), "OK  El escenario continúa inactivo", fill="#176b2d", font=F_BODY)
    rounded(d, (920, 485, 1490, 690), "#fff8e8", "#e6c76b", 12)
    d.text((960, 520), "Evidencia de prueba", fill="#6a4b00", font=F_HEADER)
    d.text((960, 580), "tabla: usuarios", fill="#222222", font=F_MONO)
    d.text((960, 620), "request_id: demo-usuario-001", fill="#222222", font=F_MONO)
    im.save(CAPTURAS / "04_prueba_exitosa_hoja_usuarios.png")


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def build_doc():
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Inches(8.5)
    sec.page_height = Inches(11)
    sec.top_margin = Inches(0.65)
    sec.bottom_margin = Inches(0.65)
    sec.left_margin = Inches(0.75)
    sec.right_margin = Inches(0.75)
    styles = doc.styles
    styles["Normal"].font.name = "Arial"
    styles["Normal"].font.size = Pt(10.5)
    styles["Normal"].font.color.rgb = RGBColor(34, 34, 34)
    for style_name, size in [("Title", 25), ("Heading 1", 17), ("Heading 2", 12)]:
        st = styles[style_name]
        st.font.name = "Arial"
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = RGBColor(0, 0, 0)

    p = doc.add_paragraph(style="Title")
    p.add_run("Automatización de datos en Google Sheets")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Proyecto VIP Ruta Segura · Documento descriptivo")
    r.italic = True
    r.font.size = Pt(12)
    p = doc.add_paragraph()
    p.add_run("Objetivo. ").bold = True
    p.add_run("Describir el flujo construido en Make para recibir solicitudes JSON, identificar la tabla de destino y registrar cada solicitud en la hoja correspondiente de Google Sheets. La prueba se realizó con datos sintéticos y el escenario quedó inactivo.")
    doc.add_paragraph()

    doc.add_heading("1 Webhook de entrada", level=1)
    doc.add_paragraph("El flujo inicia en el webhook personalizado vip-ruta-segura-api. El mensaje de entrada contiene el campo tabla, que indica qué hoja debe recibir la información. Para la validación se usó un identificador sintético y no se incluyeron archivos ni contraseñas.")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(CAPTURAS / "01_webhook_recibe_datos.png"), width=Inches(6.9))
    cap = doc.add_paragraph("Figura 1. Recepción del JSON sintético mediante el webhook.")
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.runs[0].italic = True

    doc.add_heading("2 Enrutamiento por tabla", level=1)
    doc.add_paragraph("Después del webhook, un bloque If-else evalúa tabla. La solicitud se dirige a una sola rama: usuarios, codigos_correo, viajes, reservas, asientos_reserva, pagos, reseñas, incidentes o ubicaciones_en_vivo. Si llega un valor no reconocido, la rama else no inserta datos.")
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(CAPTURAS / "02_enrutamiento_por_tabla.png"), width=Inches(6.9))
    cap = doc.add_paragraph("Figura 2. Distribución de solicitudes según el campo tabla."); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER; cap.runs[0].italic = True

    doc.add_heading("3 Hojas que reciben los registros", level=1)
    doc.add_paragraph("Cada rama termina en Google Sheets Add a Row. Los nombres de las pestañas coinciden con las tablas del prototipo y están escritos en español, conservando la estructura de los datos transaccionales que no requieren archivos.")
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(CAPTURAS / "03_hojas_google_sheets_en_espanol.png"), width=Inches(6.9))
    cap = doc.add_paragraph("Figura 3. Hojas configuradas en el libro Vip ruta segura."); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER; cap.runs[0].italic = True

    doc.add_heading("4 Prueba de funcionamiento", level=1)
    doc.add_paragraph("Se ejecutó una prueba sintética con tabla = usuarios y request_id = demo-usuario-001. Make recibió el JSON, activó únicamente la rama usuarios y agregó una fila en la hoja. La ejecución terminó sin errores y el escenario continuó inactivo.")
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(CAPTURAS / "04_prueba_exitosa_hoja_usuarios.png"), width=Inches(6.9))
    cap = doc.add_paragraph("Figura 4. Evidencia de la fila agregada en la hoja usuarios."); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER; cap.runs[0].italic = True

    doc.add_heading("5 Resumen de la automatización", level=1)
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    headers = ["Etapa", "Herramienta", "Resultado"]
    for cell, text in zip(table.rows[0].cells, headers):
        cell.text = text
        set_cell_shading(cell, "6F2DBD")
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for run in cell.paragraphs[0].runs:
            run.font.bold = True; run.font.color.rgb = RGBColor(255, 255, 255)
    rows = [
        ("Entrada", "Webhook de Make", "Recibe JSON"),
        ("Decisión", "If-else", "Evalúa tabla"),
        ("Registro", "Google Sheets", "Agrega una fila"),
        ("Validación", "Datos sintéticos", "Sin errores; escenario inactivo"),
    ]
    for row in rows:
        cells = table.add_row().cells
        for cell, text in zip(cells, row):
            cell.text = text
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    doc.add_paragraph("Estado final: la automatización está configurada, probada con datos sintéticos y permanece inactiva para evitar ejecuciones automáticas durante el prototipo.")
    doc.save(SALIDA)


if __name__ == "__main__":
    save_webhook()
    save_router()
    save_sheets()
    save_result()
    build_doc()
    print(SALIDA)
