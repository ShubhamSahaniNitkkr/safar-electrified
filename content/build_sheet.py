"""Build the Excel file that powers the Safar Electrified website."""

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

GREEN = "10281C"
CREAM = "F6F3EB"
GOLD = "F0A202"
WHITE = "FFFFFF"
SAMPLE = "FFF4D0"

header_fill = PatternFill("solid", fgColor=GREEN)
header_font = Font(name="Calibri", bold=True, color=WHITE, size=12)
body_font = Font(name="Calibri", size=12)
sample_fill = PatternFill("solid", fgColor=SAMPLE)
wrap = Alignment(wrap_text=True, vertical="top")
thin = Border(
    left=Side(style="thin", color="E3DDD0"),
    right=Side(style="thin", color="E3DDD0"),
    top=Side(style="thin", color="E3DDD0"),
    bottom=Side(style="thin", color="E3DDD0"),
)


def style_header(ws, headers, widths):
    ws.append(headers)
    for col, width in enumerate(widths, start=1):
        cell = ws.cell(1, col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.row_dimensions[1].height = 28
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}1"
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.tabColor = GREEN


def paint_row(ws, row, cols, fill=None):
    for col in range(1, cols + 1):
        cell = ws.cell(row, col)
        cell.font = body_font
        cell.alignment = wrap
        cell.border = thin
        if fill is not None:
            cell.fill = fill


def add_list(ws, cell_range, formula):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
    dv.error = "Pick a value from the list"
    dv.errorTitle = "Not in the list"
    dv.prompt = "Pick from the list"
    dv.promptTitle = "Allowed values"
    ws.add_data_validation(dv)
    dv.add(cell_range)


wb = Workbook()

start = wb.active
start.title = "Start here"
start.sheet_properties.tabColor = GOLD
start.sheet_view.showGridLines = False
start.column_dimensions["A"].width = 28
start.column_dimensions["B"].width = 110
start["A1"] = "Safar Electrified"
start["A1"].font = Font(name="Calibri", bold=True, size=22, color=GREEN)
start.merge_cells("A1:B1")

lines = [
    ("Kaise update karna hai", "Website ka content isi file se aata hai. Code mat chhedna. Nayi trip, photo, cost, video — sab yahi likho."),
    ("Abhi (local file)", "Isi file ko edit karo: content/safar-electrified.xlsx. Site refresh karo. Purana dikhe to hard refresh (Cmd+Shift+R)."),
    ("Best: Google Sheet", "1) Is file ko Google Drive pe upload karo aur Google Sheets se kholo.\n2) Share → General access → Anyone with the link → Viewer.\n3) Browser URL se Sheet ID copy karo: docs.google.com/spreadsheets/d/YEHAN_ID/edit\n4) config.js me googleSheetId ke quotes me paste karo.\n5) config.js wali site ek baar dubara upload karni hai. Uske baad sirf sheet edit karo — website refresh pe update ho jayegi."),
    ("Photos aur videos", "Google Drive me daalo. Share → Anyone with the link. Link copy karke cell me paste karo (cover_url, photo_url, proof_url, drive_video_url). YouTube link Trips sheet ke youtube_url me."),
    ("Nayi trip", "Trips sheet me example row ko copy karo. trip_id unique rakho, jaise manali-apr-2026. Wahi trip_id Stops, Costs, Changes, Problems, Gallery me likho. published = yes. is_sample = no."),
    ("Example trip", "Delhi → Jaipur wali row sirf layout dikhane ke liye hai. Apni trip daalne ke baad is row ka published = no kar dena, warna site pe Example dikhega."),
    ("Sheet ke naam", "Tabs ka naam mat badalna: Settings, Trips, Stops, Costs, Changes, Problems, Gallery. Header row (pehli line) bhi mat badalna."),
    ("Costs — basis", "trip = poori gaadi ka bill (charging, toll). Log badhenge to ye split hota hai, amount nahi badhta.\nperson = har insaan pe ek baar.\nperson_day = khana. Yahi amount food slider ki shuruaat hai (per person per day).\nroom_night = ek room ki ek raat. Trips me per_room = ek room me kitne log. 3 likha aur group 5 ya 6 hua to 2 room, hotel ka bill badhega. Khali = 2 log ek room."),
    ("Calculator", "Har trip page pe logon ka +/− hai, room ka +/− hai, aur khane ka slider hai. Extra cost bhi add kar sakte ho. Ye sirf us visitor ke estimate ke liye hai — sheet ki amount nahi badalti."),
    ("Share", "Har trip ka link WhatsApp, Instagram, aur baaki apps pe share hota hai. Link me trip khulti hai."),
    ("Consult ₹500", "Settings me whatsapp (9198xxxxxx, bina space) aur upi_id (name@bank) bharo. Form usi number pe WhatsApp karega, aur UPI se ₹500 ka pay button dikhega. Price badalni ho to consult_price."),
    ("Settings", "Key column mat badalna. Sirf value column edit karo — headline, about, YouTube, Instagram, WhatsApp, UPI."),
]

start["A3"] = "Topic"
start["B3"] = "Kya karna hai"
for col in (1, 2):
    start.cell(3, col).fill = header_fill
    start.cell(3, col).font = header_font
for i, (topic, text) in enumerate(lines, start=4):
    start.cell(i, 1, topic).font = Font(name="Calibri", bold=True, size=12, color=GREEN)
    start.cell(i, 2, text).font = body_font
    start.cell(i, 1).alignment = wrap
    start.cell(i, 2).alignment = wrap
    start.row_dimensions[i].height = 48 if len(text) < 180 else 96
start.row_dimensions[7].height = 120
start.freeze_panes = "A4"

# Settings
ws = wb.create_sheet("Settings")
style_header(ws, ["key", "value"], [22, 88])
settings = [
    ("channel_name", "Safar Electrified"),
    ("tagline", "Travel · Charge · Explore"),
    ("home_title", "See the trip. Then price it for your car."),
    (
        "home_text",
        "I film the drive, and I write down the part a video usually skips: every charge stop, the hotel and the food, the problems, and what I changed on the EV. Watch it here. If you are planning a similar road, move the calculator and see what it costs for your group.",
    ),
    (
        "about",
        "Safar Electrified is my notebook of electric road trips. YouTube has the film. This page has the route, the money, and the proof — so the next person can plan the same drive without guessing.",
    ),
    ("youtube_url", ""),
    ("instagram_url", ""),
    ("whatsapp", ""),
    ("upi_id", ""),
    ("consult_price", 500),
]
for row in settings:
    ws.append(row)
for r in range(2, 2 + len(settings)):
    paint_row(ws, r, 2)
    ws.row_dimensions[r].height = 36
ws.row_dimensions[5].height = 72
ws.row_dimensions[6].height = 60
ws["B9"].comment = Comment("WhatsApp number with country code, no spaces or plus. Example: 919876543210", "Safar")
ws["B10"].comment = Comment("Your UPI id, for example name@oksbi. Visitors paying ₹500 are sent here.", "Safar")
ws["B7"].comment = Comment("Full channel URL, for example https://www.youtube.com/@yourchannel", "Safar")
ws["C1"] = "Sirf value column edit karo. Key column mat badalna."
ws["C1"].font = Font(name="Calibri", italic=True, color="5D6F64", size=11)

# Trips
trips = wb.create_sheet("Trips")
trip_headers = [
    "trip_id",
    "published",
    "is_sample",
    "title",
    "from_place",
    "to_place",
    "trip_date",
    "days",
    "nights",
    "distance_km",
    "ev_model",
    "party",
    "cover_url",
    "youtube_url",
    "drive_video_url",
    "summary",
    "story",
    "per_room",
]
style_header(
    trips,
    trip_headers,
    [24, 14, 12, 28, 16, 16, 14, 10, 10, 14, 20, 10, 36, 32, 32, 42, 70],
)
story = (
    "This row is only an example of how a trip page reads. Replace it with your own notes, then set is_sample to no.\n"
    "Left Delhi with a full battery in a Nexon EV. The car showed enough range for Jaipur, but highway speed brought it down, so I stopped once to charge.\n"
    "The hotel socket was too slow for an overnight full charge. The portable 16A charger is the fix, and the bill photo sits beside that cost."
)
trips.append(
    [
        "example-delhi-jaipur",
        "yes",
        "yes",
        "Delhi to Jaipur",
        "Delhi",
        "Jaipur",
        "2026-01-18",
        2,
        1,
        281,
        "Tata Nexon EV",
        2,
        "assets/banner.jpg",
        "",
        "",
        "Example page: one charge stop, a hotel socket that was too slow, and the bills. Replace this row with your own trip.",
        story,
    ]
)
paint_row(trips, 2, len(trip_headers), sample_fill)
trips.row_dimensions[2].height = 96
trips["G2"].number_format = "YYYY-MM-DD"
add_list(trips, "B2:B500", '"yes,no"')
add_list(trips, "C2:C500", '"yes,no"')
trips["A2"].comment = Comment("Unique id. Same id must be used on Stops, Costs, Changes, Problems, and Gallery. No spaces — use-dashes.", "Safar")

# Stops
stops = wb.create_sheet("Stops")
stop_headers = ["trip_id", "stop_order", "name", "km", "kind", "battery", "notes", "photo_url", "amount"]
style_header(stops, stop_headers, [24, 12, 22, 10, 12, 16, 55, 36])
stop_rows = [
    ["example-delhi-jaipur", 1, "Delhi", 0, "start", "100%", "Left in the morning with a full battery.", ""],
    ["example-delhi-jaipur", 2, "Neemrana", 122, "food", "61%", "Short break. Did not need a charger yet.", ""],
    ["example-delhi-jaipur", 3, "Shahpura", 154, "charge", "34% → 80%", "One stall was down. About 45 minutes on the working DC charger, plus a wait.", ""],
    ["example-delhi-jaipur", 4, "Jaipur", 281, "end", "41%", "Hotel parking. The room socket was only 5A, too slow for a full overnight charge.", ""],
]
for row in stop_rows:
    stops.append(row)
for r in range(2, 6):
    paint_row(stops, r, len(stop_headers), sample_fill)
    stops.row_dimensions[r].height = 36
add_list(stops, "E2:E500", '"start,charge,food,stay,sight,end"')

# Costs
costs = wb.create_sheet("Costs")
cost_headers = ["trip_id", "category", "label", "amount", "basis", "notes", "proof_url", "per_room"]
style_header(costs, cost_headers, [24, 14, 32, 12, 16, 55, 36])
cost_rows = [
    ["example-delhi-jaipur", "charging", "DC fast charge at Shahpura", 850, "trip", "One session, about 45 minutes. The charger screenshot belongs with this line.", ""],
    ["example-delhi-jaipur", "toll", "Delhi–Jaipur tolls", 420, "trip", "FASTag for the car, not per person.", ""],
    ["example-delhi-jaipur", "stay", "Hotel in Jaipur", 2800, "room_night", "One room for two people. The calculator adds a room when the group grows.", ""],
    ["example-delhi-jaipur", "food", "Meals", 700, "person_day", "This is the food slider's starting point: rupees per person per day.", ""],
]
for row in cost_rows:
    costs.append(row)
for r in range(2, 6):
    paint_row(costs, r, len(cost_headers), sample_fill)
    costs.row_dimensions[r].height = 36
add_list(costs, "B2:B500", '"charging,toll,stay,food,parking,other"')
add_list(costs, "E2:E500", '"trip,person,person_day,room_night"')
costs["E1"].comment = Comment("trip = whole car. person = each person once. person_day = food slider. room_night = hotel, 2 people per room.", "Safar")

# Changes
changes = wb.create_sheet("Changes")
change_headers = ["trip_id", "title", "cost", "place", "notes", "proof_url"]
style_header(changes, change_headers, [24, 32, 12, 22, 60, 36])
changes.append(
    [
        "example-delhi-jaipur",
        "Portable 16A charger",
        1500,
        "Karol Bagh",
        "Bought so a normal hotel socket can actually charge the car overnight. The bill photo belongs with this line.",
        "",
    ]
)
paint_row(changes, 2, len(change_headers), sample_fill)
changes.row_dimensions[2].height = 48

# Problems
problems = wb.create_sheet("Problems")
problem_headers = ["trip_id", "title", "detail", "proof_url"]
style_header(problems, problem_headers, [24, 32, 70, 36])
problems.append(
    [
        "example-delhi-jaipur",
        "Hotel socket was too slow",
        "The room point was a 5A socket. A full charge overnight was not realistic. Next time the portable 16A charger comes along, and I ask the hotel about a 15A point before booking.",
        "",
    ]
)
problems.append(
    [
        "example-delhi-jaipur",
        "One charger stall was down",
        "At Shahpura a stall was offline, so there was a queue on the working one. I waited about 25 minutes. Worth checking the charger app before leaving the previous stop.",
        "",
    ]
)
for r in range(2, 4):
    paint_row(problems, r, len(problem_headers), sample_fill)
    problems.row_dimensions[r].height = 60

# Gallery
gallery = wb.create_sheet("Gallery")
gallery_headers = ["trip_id", "caption", "photo_url"]
style_header(gallery, gallery_headers, [24, 40, 55])
gallery.append(["example-delhi-jaipur", "Paste a Google Drive photo link in photo_url. This sample row stays hidden until the link is there.", ""])
paint_row(gallery, 2, 3, sample_fill)
gallery.row_dimensions[2].height = 36
gallery["C2"].comment = Comment("Drive share link. File must be Anyone with the link. Empty photo_url is skipped on the site.", "Safar")

# Consults — header only, so he can see where WhatsApp requests could later be logged by hand
consults = wb.create_sheet("Consults")
style_header(
    consults,
    ["when", "name", "phone", "city", "ev", "route", "travel_when", "people", "question"],
    [16, 20, 16, 16, 20, 24, 16, 12, 50],
)
consults["A2"] = "Form WhatsApp pe aayega. Chaaho to yahan copy bhi rakh sakte ho. Is sheet ko website nahi padhti."
consults["A2"].font = Font(name="Calibri", italic=True, color="5D6F64", size=11)

wb.save("content/safar-electrified.xlsx")
print("wrote content/safar-electrified.xlsx")
