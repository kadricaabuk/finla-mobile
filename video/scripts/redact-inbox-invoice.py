#!/usr/bin/env python3
"""Rasterize the source e-Arşiv PDF and paint over Mysoft strings."""
import pypdfium2 as pdfium
from PIL import ImageDraw, ImageFont

PDF = "public/inbox-invoice.pdf"
OUT = "public/inbox-invoice.png"

page = pdfium.PdfDocument(PDF)[0]
img = page.render(scale=2.5).to_pil().convert("RGB")
draw = ImageDraw.Draw(img)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
font_sm = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
P, I = (255, 255, 255), (17, 17, 17)

draw.rectangle((20, 50, 640, 76), fill=P)
draw.text((24, 52), "NOVA MEDYA REKLAM VE İLETİŞİM A.Ş.", fill=I, font=font)
draw.rectangle((115, 226, 380, 250), fill=P)
draw.text((117, 228), "novamedya.com.tr", fill=I, font=font_sm)
draw.rectangle((90, 262, 360, 288), fill=P)
draw.text((92, 264), "info@novamedya.com.tr", fill=I, font=font_sm)
draw.rectangle((630, 1314, 820, 1336), fill=P)
draw.text((632, 1316), "NOVA MEDYA A.Ş.", fill=I, font=font_sm)

img.save(OUT)
print("wrote", OUT, img.size)
