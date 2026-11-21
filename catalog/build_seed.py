"""يبني catalog/seed.json: أصناف سوق غزة المصنفة بوحداتها ووحدة الطلب المعتادة وسعر مرجعي.
الأسعار: unicef = وسيط أسعار UNICEF Gaza Market Monitoring 25–27 أغسطس 2026 (تجزئة)، estimate = تقدير يراجعه المالك.
كل الأصناف تُستورد مسودات مخفية حتى يراجع المالك الأسعار وينشرها."""
import json

def U(unit, factor, price_nis, min_q=1, step=1, frac=False):
    return {"unitId": unit, "factorToBase": round(factor * 1000), "price": round(price_nis * 100), "minQtyMilli": round(min_q * 1000), "stepMilli": round(step * 1000), "allowFraction": frac}

P = []
def add(cat, sku, name, alt, units, default, icon, src="estimate", brand=None, desc=""):
    P.append({"categoryId": cat, "sku": sku, "name": name, "altNames": alt, "units": units, "baseUnitId": units[0]["unitId"], "defaultUnitId": default,
              "icon": icon, "priceSource": src, **({"brand": brand} if brand else {}), "description": desc})

KG = lambda p, mn=1, cart=None: [U("kg", 1, p, mn, 0.5, True)] + ([U("carton", cart, p * cart)] if cart else [])

# ===== المجمدات (17) =====
add("frozen", "FRZ-001", "دجاج كامل مجمد", ["فراخ مجمدة", "جاج مجمد", "دجاج"], KG(21, 1, 10), "kg", "chicken", "unicef", desc="كرتونة 10 كغ تقريباً")
add("frozen", "FRZ-002", "صدر دجاج مجمد", ["صدور دجاج", "فيليه دجاج", "صدر"], KG(32, 1, 10), "kg", "chicken_part")
add("frozen", "FRZ-003", "أفخاذ دجاج مجمدة", ["فخاد دجاج", "اوراك", "شيش"], KG(24, 1, 10), "kg", "chicken_part")
add("frozen", "FRZ-004", "أجنحة دجاج مجمدة", ["جوانح", "اجنحه"], KG(20, 1, 10), "kg", "chicken_part")
add("frozen", "FRZ-005", "كبدة دجاج مجمدة", ["كبده", "قوانص"], [U("box", 1, 18), U("carton", 10, 170)], "carton", "box_red", desc="علبة 1 كغ، كرتونة 10 علب")
add("frozen", "FRZ-006", "لحم بقري مجمد", ["لحمة عجل", "لحم عجل", "لحمه"], KG(40, 1, 20), "kg", "meat", "unicef")
add("frozen", "FRZ-007", "لحم حبش مجمد", ["حبش", "ديك رومي", "تركي"], KG(32, 1, 10), "kg", "meat", "unicef")
add("frozen", "FRZ-008", "لحم مفروم مجمد", ["مفرومة", "كفتة"], [U("pack", 0.5, 22), U("carton", 10, 210)], "carton", "meat", desc="عبوة 500 غرام، كرتونة 20 عبوة")
add("frozen", "FRZ-009", "سمك بوري مجمد", ["بوري", "اسماك", "سمك"], KG(28, 1, 10), "kg", "fish")
add("frozen", "FRZ-010", "سمك فيليه بانغا مجمد", ["فيليه سمك", "بانغا", "فيليه"], KG(22, 1, 10), "kg", "fish")
add("frozen", "FRZ-011", "جمبري مجمد", ["قريدس", "روبيان", "جمبري"], [U("box", 1, 55), U("carton", 10, 520)], "box", "shrimp", desc="علبة 1 كغ")
add("frozen", "FRZ-012", "بازيلاء مجمدة 400 غرام", ["بازيلا", "بسلة"], [U("bag", 1, 6), U("carton", 20, 110)], "carton", "veg_green")
add("frozen", "FRZ-013", "بامية مجمدة 400 غرام", ["باميه"], [U("bag", 1, 8), U("carton", 20, 150)], "carton", "veg_green")
add("frozen", "FRZ-014", "ملوخية مجمدة 400 غرام", ["ملوخيه", "ملوخية ورق"], [U("bag", 1, 7), U("carton", 20, 130)], "carton", "veg_leaf")
add("frozen", "FRZ-015", "فول أخضر مجمد 400 غرام", ["فول اخضر", "فول"], [U("bag", 1, 6), U("carton", 20, 110)], "carton", "veg_green")
add("frozen", "FRZ-016", "خضار مشكلة مجمدة 400 غرام", ["خضار مشكل", "مكس خضار"], [U("bag", 1, 6), U("carton", 20, 110)], "carton", "veg_mix")
add("frozen", "FRZ-017", "بطاطا مقلية مجمدة 2.5 كغ", ["بطاطا فرايز", "شيبس مجمد", "فرنش فرايز"], [U("bag", 1, 25), U("carton", 4, 95)], "bag", "fries")
add("frozen", "FRZ-018", "برغر لحم مجمد 20 قطعة", ["برجر", "همبرغر"], [U("box", 1, 35), U("carton", 6, 200)], "box", "burger")
add("frozen", "FRZ-019", "نقانق دجاج مجمدة 500 غرام", ["نقانق", "سجق", "هوت دوغ"], [U("pack", 1, 12), U("carton", 20, 230)], "carton", "sausage")

# ===== المواد التموينية (10) =====
add("staples", "STP-001", "أرز حبة طويلة", ["رز", "ارز بسمتي", "رز طويل"], [U("kg", 1, 8, 1, 1, True), U("sack", 25, 190)], "sack", "sack_rice", "unicef", desc="شوال 25 كغ")
add("staples", "STP-002", "سكر أبيض", ["سكر"], [U("kg", 1, 4.5, 1, 1, True), U("sack", 50, 215)], "sack", "sack", "unicef", desc="شوال 50 كغ")
add("staples", "STP-003", "طحين أبيض متعدد الاستعمالات", ["دقيق", "طحين"], [U("kg", 1, 1.2, 1, 1, True), U("sack", 25, 30)], "sack", "sack_flour", "unicef", desc="شوال 25 كغ")
add("staples", "STP-004", "زيت نباتي 1 لتر", ["زيت قلي", "زيت ذرة", "زيت"], [U("liter", 1, 8), U("carton", 12, 92)], "carton", "bottle_oil", "unicef")
add("staples", "STP-005", "عدس مجروش أحمر", ["عدس احمر", "شوربة عدس"], [U("kg", 1, 6, 1, 1, True), U("sack", 25, 140)], "kg", "sack_lentil", "unicef")
add("staples", "STP-006", "حمص حب ناشف", ["حمص ناشف", "حمص"], [U("kg", 1, 6, 1, 1, True), U("sack", 25, 140)], "kg", "sack_beans", "unicef")
add("staples", "STP-007", "فاصولياء بيضاء ناشفة", ["فاصوليا", "فاصولياء"], [U("kg", 1, 5, 1, 1, True), U("sack", 25, 115)], "kg", "sack_beans", "unicef")
add("staples", "STP-008", "فول ناشف", ["فول مدمس ناشف", "فول حب"], [U("kg", 1, 6, 1, 1, True), U("sack", 25, 140)], "kg", "sack_beans", "unicef")
add("staples", "STP-009", "طحينة 1 كغ", ["طحينه", "سمسم"], [U("box", 1, 15.5), U("carton", 12, 180)], "carton", "jar", "unicef")
add("staples", "STP-010", "ملح طعام 1 كغ", ["ملح"], [U("bag", 1, 4), U("carton", 20, 75)], "carton", "bag_salt", "unicef")
add("staples", "STP-011", "معكرونة 400 غرام", ["مكرونة", "باستا", "معكرونه"], [U("bag", 1, 4), U("carton", 20, 75)], "carton", "pasta")

# ===== الألبان والأجبان (10) =====
add("dairy", "DAI-001", "حليب سائل كامل الدسم 1 لتر", ["حليب", "لبن حليب"], [U("liter", 1, 8), U("carton", 12, 92)], "carton", "milk_carton", "unicef")
add("dairy", "DAI-002", "حليب بودرة 500 غرام", ["حليب مجفف", "بودرة حليب", "نيدو"], [U("pack", 1, 18.75), U("carton", 12, 220)], "pack", "milk_powder", "unicef")
add("dairy", "DAI-003", "لبن زبادي 1 كغ", ["لبن", "زبادي", "لبنة سائلة"], [U("box", 1, 16.5), U("carton", 6, 95)], "box", "yogurt", "unicef")
add("dairy", "DAI-004", "جبنة بيضاء معلبة 250 غرام", ["جبنه بيضاء", "جبنة", "جبن", "فيتا"], [U("box", 1, 2.5), U("carton", 48, 115)], "carton", "cheese_can", "unicef")
add("dairy", "DAI-005", "جبنة نابلسية 1 كغ", ["جبنة بلدية", "نابلسي", "جبنه"], [U("kg", 1, 38, 1, 0.5, True), U("carton", 10, 370)], "carton", "cheese")
add("dairy", "DAI-006", "جبنة شرائح 200 غرام", ["جبنة توست", "شرائح", "جبن"], [U("pack", 1, 9), U("carton", 24, 205)], "carton", "cheese")
add("dairy", "DAI-007", "جبنة مثلثات 16 قطعة", ["جبنة مثلثات", "بقرة ضاحكة", "جبن"], [U("box", 1, 12), U("carton", 24, 275)], "carton", "cheese_round")
add("dairy", "DAI-008", "لبنة 500 غرام", ["لبنه"], [U("box", 1, 10), U("carton", 12, 115)], "carton", "yogurt")
add("dairy", "DAI-009", "زبدة 200 غرام", ["زبده"], [U("pack", 1, 10), U("carton", 40, 380)], "carton", "butter")
add("dairy", "DAI-010", "بيض طبق 30 حبة", ["بيض", "طبق بيض", "كرتونة بيض"], [U("pack", 1, 35), U("carton", 12, 410)], "pack", "eggs", "unicef", desc="الطبق 30 بيضة")

# ===== المكسرات والمسليات والحلويات (10) =====
add("snacks", "SNK-001", "شيبس بطاطا 70 غرام", ["شيبس", "تشيبس"], [U("bag", 1, 2), U("carton", 40, 75)], "carton", "chips")
add("snacks", "SNK-002", "بسكويت محشي 12 حبة", ["بسكويت"], [U("pack", 1, 5), U("carton", 24, 110)], "carton", "biscuit")
add("snacks", "SNK-003", "شوكولاتة ويفر", ["ويفر", "شوكولاته"], [U("piece", 1, 2), U("box", 24, 42), U("carton", 288, 480)], "box", "chocolate")
add("snacks", "SNK-004", "لوح شوكولاتة بالحليب 100 غرام", ["شوكولاتة", "شوكلاته"], [U("piece", 1, 6), U("box", 20, 110)], "box", "chocolate")
add("snacks", "SNK-005", "بزر عباد الشمس", ["بزر", "بذر", "لب سوري"], [U("kg", 1, 25, 0.5, 0.5, True), U("carton", 10, 240)], "kg", "nuts")
add("snacks", "SNK-006", "فستق حلبي محمص", ["فستق", "فستق حلبي"], [U("kg", 1, 70, 0.5, 0.5, True)], "kg", "nuts")
add("snacks", "SNK-007", "فول سوداني محمص", ["فستق عبيد", "فول سوداني"], [U("kg", 1, 20, 0.5, 0.5, True)], "kg", "nuts")
add("snacks", "SNK-008", "كيك ملفوف بالكريمة", ["كيك", "سويسرول"], [U("piece", 1, 2), U("carton", 24, 44)], "carton", "cake")
add("snacks", "SNK-009", "حلقوم بالنكهات", ["راحة", "حلقوم"], [U("kg", 1, 18, 0.5, 0.5, True)], "kg", "candy")
add("snacks", "SNK-010", "علكة نعناع", ["علكه", "لبان"], [U("box", 1, 12), U("carton", 20, 220)], "box", "candy")

# ===== المشروبات (10) =====
add("beverages", "BEV-001", "مياه شرب معدنية 1.5 لتر", ["مي", "ماء", "مياه"], [U("piece", 1, 3), U("carton", 6, 16)], "carton", "water", "unicef", desc="مرجع UNICEF 5.33 للتر الواحد")
add("beverages", "BEV-002", "مشروب غازي كولا 330 مل", ["كولا", "بيبسي", "كوكاكولا", "غازي"], [U("piece", 1, 3), U("carton", 24, 65)], "carton", "soda")
add("beverages", "BEV-003", "مشروب غازي برتقال 330 مل", ["ميرندا", "فانتا", "غازي برتقال"], [U("piece", 1, 3), U("carton", 24, 65)], "carton", "soda_orange")
add("beverages", "BEV-004", "عصير برتقال 1 لتر", ["عصير", "برتقال"], [U("piece", 1, 8), U("carton", 12, 90)], "carton", "juice")
add("beverages", "BEV-005", "عصير مانجو 200 مل", ["عصير مانجا", "مانجو"], [U("piece", 1, 2), U("carton", 27, 48)], "carton", "juice")
add("beverages", "BEV-006", "شاي أسود 100 كيس", ["شاي", "شاي فرط", "تي"], [U("box", 1, 15), U("carton", 24, 340)], "box", "tea")
add("beverages", "BEV-007", "قهوة عربية مطحونة بالهيل 200 غرام", ["قهوة", "بن", "قهوه"], [U("pack", 1, 15), U("carton", 20, 280)], "pack", "coffee")
add("beverages", "BEV-008", "قهوة سريعة التحضير 3 في 1", ["نسكافيه", "قهوة فوري"], [U("box", 1, 18), U("carton", 24, 410)], "box", "coffee")
add("beverages", "BEV-009", "مشروب طاقة 250 مل", ["طاقة", "ريد بول"], [U("piece", 1, 5), U("carton", 24, 110)], "carton", "soda")
add("beverages", "BEV-010", "شراب توت مركّز 1 لتر", ["شراب", "عصير مركز", "توت"], [U("piece", 1, 10), U("carton", 12, 115)], "carton", "juice")

# ===== المنظفات (10) =====
add("cleaning", "CLN-001", "مسحوق غسيل أوتوماتيك 3 كغ", ["تايد", "اريال", "مسحوق"], [U("pack", 1, 35), U("carton", 4, 135)], "pack", "detergent_box")
add("cleaning", "CLN-002", "سائل غسيل ملابس 1 لتر", ["منظف غسيل", "سائل غسيل"], [U("piece", 1, 14), U("carton", 12, 160)], "carton", "detergent", "unicef")
add("cleaning", "CLN-003", "سائل جلي 1 لتر", ["صابون جلي", "فيري", "جلي"], [U("piece", 1, 10.8), U("carton", 12, 125)], "carton", "dish_soap", "unicef")
add("cleaning", "CLN-004", "كلور مبيض 1 لتر", ["كلور", "كلوركس", "مبيض"], [U("piece", 1, 11), U("carton", 12, 125)], "carton", "bleach", "unicef")
add("cleaning", "CLN-005", "صابون غار 150 غرام", ["صابون", "صابونة"], [U("piece", 1, 3), U("carton", 48, 135)], "carton", "soap", "unicef")
add("cleaning", "CLN-006", "معطر أرضيات 1 لتر", ["فلاش", "منظف ارضيات", "معطر"], [U("piece", 1, 9), U("carton", 12, 100)], "carton", "detergent")
add("cleaning", "CLN-007", "منظف زجاج بخاخ 500 مل", ["منظف زجاج", "بخاخ"], [U("piece", 1, 8), U("carton", 12, 90)], "carton", "spray")
add("cleaning", "CLN-008", "إسفنج جلي 5 قطع", ["سفنج", "ليفة"], [U("pack", 1, 5), U("carton", 48, 220)], "pack", "sponge")
add("cleaning", "CLN-009", "أكياس قمامة كبيرة 20 كيس", ["اكياس زبالة", "اكياس نفايات"], [U("pack", 1, 6), U("carton", 50, 270)], "pack", "trash_bags")
add("cleaning", "CLN-010", "معقم مطهر 500 مل", ["ديتول", "مطهر", "معقم"], [U("piece", 1, 15), U("carton", 12, 170)], "carton", "bottle")

# ===== مستلزمات الأطفال (10) =====
add("baby", "BBY-001", "حفاضات أطفال مقاس 3 (40 حبة)", ["بامبرز", "حفاضات", "فوط اطفال"], [U("pack", 1, 35), U("carton", 4, 135)], "pack", "diapers", "unicef")
add("baby", "BBY-002", "حفاضات أطفال مقاس 4 (36 حبة)", ["بامبرز 4", "حفاضات"], [U("pack", 1, 36), U("carton", 4, 138)], "pack", "diapers")
add("baby", "BBY-003", "حفاضات أطفال مقاس 5 (32 حبة)", ["بامبرز 5", "حفاضات"], [U("pack", 1, 37), U("carton", 4, 142)], "pack", "diapers")
add("baby", "BBY-004", "حليب أطفال رضع 400 غرام", ["حليب رضع", "حليب اطفال", "سيميلاك"], [U("box", 1, 40), U("carton", 12, 470)], "box", "formula", "unicef")
add("baby", "BBY-005", "مناديل مبللة للأطفال 72 منديل", ["مناديل مبللة", "وايبس"], [U("pack", 1, 7), U("carton", 24, 160)], "carton", "wipes")
add("baby", "BBY-006", "سيريلاك أرز بالحليب 400 غرام", ["سيريلاك", "طعام اطفال"], [U("box", 1, 22), U("carton", 12, 255)], "box", "formula")
add("baby", "BBY-007", "شامبو أطفال 300 مل", ["شامبو اطفال", "جونسون"], [U("piece", 1, 12), U("carton", 12, 138)], "piece", "shampoo")
add("baby", "BBY-008", "زجاجة رضاعة 250 مل", ["رضاعة", "ببرونة"], [U("piece", 1, 15), U("carton", 24, 340)], "piece", "bottle_baby")
add("baby", "BBY-009", "كريم حفاضات 100 غرام", ["كريم تسلخات", "سودوكريم"], [U("piece", 1, 14)], "piece", "cream")
add("baby", "BBY-010", "بودرة أطفال 200 غرام", ["بودرة", "باودر"], [U("piece", 1, 9), U("carton", 24, 205)], "piece", "powder")

# ===== العناية الشخصية (10) =====
add("personal_care", "PRC-001", "شامبو شعر 400 مل", ["شامبو", "هيد اند شولدرز"], [U("piece", 1, 10), U("carton", 12, 115)], "carton", "shampoo", "unicef")
add("personal_care", "PRC-002", "معجون أسنان 100 مل", ["معجون", "كولجيت"], [U("piece", 1, 6), U("carton", 72, 410)], "piece", "toothpaste", "unicef")
add("personal_care", "PRC-003", "فرشاة أسنان", ["فرشاية", "فرشاة"], [U("piece", 1, 2), U("box", 12, 22)], "box", "toothbrush", "unicef")
add("personal_care", "PRC-004", "فوط صحية 16 حبة", ["فوط", "اولويز"], [U("pack", 1, 9), U("carton", 24, 205)], "pack", "pads", "unicef")
add("personal_care", "PRC-005", "مزيل عرق بخاخ 150 مل", ["مزيل عرق", "ديودرنت"], [U("piece", 1, 12), U("carton", 12, 138)], "piece", "spray")
add("personal_care", "PRC-006", "صابون سائل لليدين 500 مل", ["صابون يدين", "صابون سائل"], [U("piece", 1, 8), U("carton", 12, 90)], "carton", "pump")
add("personal_care", "PRC-007", "شفرات حلاقة 5 حبات", ["شفرات", "موس حلاقة"], [U("pack", 1, 8), U("box", 24, 180)], "pack", "razor")
add("personal_care", "PRC-008", "ورق تواليت 10 لفات", ["محارم تواليت", "ورق حمام"], [U("pack", 1, 22), U("carton", 4, 85)], "pack", "toilet_paper", "unicef", desc="مرجع UNICEF 2.5 للفة")
add("personal_care", "PRC-009", "محارم ورقية 500 منديل", ["محارم", "كلينكس", "مناديل"], [U("box", 1, 5), U("carton", 30, 140)], "carton", "tissue")
add("personal_care", "PRC-010", "كريم مرطب 200 مل", ["كريم", "نيفيا", "مرطب"], [U("piece", 1, 12), U("carton", 12, 138)], "piece", "cream")

# ===== الخضروات والفواكه والبيض (10) =====
add("produce", "PRD-001", "بندورة", ["طماطم", "بندوره"], [U("kg", 1, 8, 1, 1, True), U("box", 10, 75)], "kg", "tomato", "unicef", desc="صندوق 10 كغ تقريباً")
add("produce", "PRD-002", "بطاطا", ["بطاطس", "بطاطا حمرا"], [U("kg", 1, 7, 1, 1, True), U("sack", 20, 130)], "kg", "potato", "unicef")
add("produce", "PRD-003", "بصل أحمر", ["بصل"], [U("kg", 1, 6, 1, 1, True), U("sack", 20, 110)], "kg", "onion", "unicef")
add("produce", "PRD-004", "خيار", ["خيار بلدي"], [U("kg", 1, 12, 1, 1, True), U("box", 10, 115)], "kg", "cucumber", "unicef")
add("produce", "PRD-005", "باذنجان", ["بتنجان", "باذنجان بلدي"], [U("kg", 1, 4, 1, 1, True), U("box", 10, 38)], "kg", "eggplant", "unicef")
add("produce", "PRD-006", "فلفل حلو", ["فليفلة", "فلفل"], [U("kg", 1, 10, 1, 1, True)], "kg", "pepper")
add("produce", "PRD-007", "ليمون", ["ليمون حامض", "لمون"], [U("kg", 1, 8, 1, 1, True)], "kg", "lemon")
add("produce", "PRD-008", "تفاح أحمر", ["تفاح"], [U("kg", 1, 12, 1, 1, True), U("box", 18, 205)], "kg", "apple")
add("produce", "PRD-009", "موز", ["موز بلدي"], [U("kg", 1, 9, 1, 1, True), U("box", 13, 110)], "kg", "banana")
add("produce", "PRD-010", "جزر", ["جزر بلدي"], [U("kg", 1, 6, 1, 1, True), U("sack", 10, 55)], "kg", "carrot")

# ===== الأدوات المنزلية (10) =====
add("household", "HSH-001", "دلو بلاستيك 15 لتر", ["سطل", "جردل", "دلو"], [U("piece", 1, 25)], "piece", "bucket", "unicef")
add("household", "HSH-002", "جالون مياه 20 لتر", ["جالون", "قلن", "جركن"], [U("piece", 1, 15)], "piece", "jerrycan", "unicef")
add("household", "HSH-003", "غاز طهي (تعبئة كيلو)", ["غاز", "جرة غاز"], [U("kg", 1, 80, 1, 1, False)], "kg", "gas", "unicef")
add("household", "HSH-004", "فحم", ["فحم شوي", "فحم"], [U("kg", 1, 16, 1, 1, True), U("bag", 10, 150)], "kg", "coal", "unicef")
add("household", "HSH-005", "حطب", ["حطب", "خشب"], [U("kg", 1, 6, 1, 1, True), U("sack", 25, 140)], "kg", "wood", "unicef")
add("household", "HSH-006", "شريط لاصق عريض", ["لزق", "تيب", "شريط"], [U("piece", 1, 20), U("carton", 36, 680)], "piece", "tape", "unicef")
add("household", "HSH-007", "حبل متعدد الاستخدام", ["حبل", "حبال"], [U("piece", 1, 10)], "piece", "rope", "unicef")
add("household", "HSH-008", "شادر نايلون (للمتر المربع)", ["شادر", "نايلون", "مشمع"], [U("piece", 1, 6)], "piece", "tarp", "unicef", desc="السعر للمتر المربع")
add("household", "HSH-009", "بطانية", ["حرام", "بطانيه"], [U("piece", 1, 25)], "piece", "blanket", "unicef")
add("household", "HSH-010", "ولاعة غاز", ["قداحة", "ولاعه"], [U("piece", 1, 2), U("box", 50, 85)], "box", "lighter")
add("household", "HSH-011", "صحون بلاستيك 50 صحن", ["صحون", "اطباق بلاستيك"], [U("pack", 1, 8), U("carton", 20, 150)], "pack", "plates")

# ===== المعلبات (10) =====
add("canned", "CAN-001", "تونة 160 غرام", ["تونه", "تونا"], [U("box", 1, 5), U("carton", 48, 230)], "carton", "can_tuna", "unicef")
add("canned", "CAN-002", "فول مدمس 380 غرام", ["فول معلب", "فول"], [U("box", 1, 2.85), U("carton", 24, 65)], "carton", "can", "unicef")
add("canned", "CAN-003", "حمص مسلوق 380 غرام", ["حمص معلب", "حمص"], [U("box", 1, 3), U("carton", 24, 68)], "carton", "can")
add("canned", "CAN-004", "فاصولياء بيضاء بصلصة الطماطم", ["فاصوليا معلبة", "بيكد بينز"], [U("box", 1, 3), U("carton", 24, 68)], "carton", "can")
add("canned", "CAN-005", "سردين بالزيت 125 غرام", ["سردين", "سردينة"], [U("box", 1, 3), U("carton", 50, 140)], "carton", "can_tuna")
add("canned", "CAN-006", "لحمة معلبة (لانشون) 200 غرام", ["لانشون", "مرتديلا معلبة"], [U("box", 1, 6), U("carton", 24, 135)], "carton", "can")
add("canned", "CAN-007", "معجون طماطم 400 غرام", ["رب بندورة", "صلصة", "معجون"], [U("box", 1, 4), U("carton", 24, 90)], "carton", "can_red")
add("canned", "CAN-008", "ذرة حلوة معلبة 340 غرام", ["ذرة", "ذره"], [U("box", 1, 4), U("carton", 24, 90)], "carton", "can_yellow")
add("canned", "CAN-009", "مربى مشمش 450 غرام", ["مربى", "مربا"], [U("box", 1, 8), U("carton", 12, 90)], "carton", "jar")
add("canned", "CAN-010", "حلاوة طحينية 500 غرام", ["حلاوة", "حلاوه"], [U("box", 1, 12), U("carton", 12, 138)], "carton", "jar")

# ===== البهارات (10) =====
add("spices", "SPC-001", "زعتر بلدي", ["زعتر", "دقة"], [U("kg", 1, 30, 0.25, 0.25, True), U("half_kg", 0.5, 16), U("quarter_kg", 0.25, 8.5)], "kg", "spice_green")
add("spices", "SPC-002", "بهارات مشكلة", ["بهار", "سبع بهارات"], [U("kg", 1, 40, 0.25, 0.25, True), U("pack", 0.1, 5)], "pack", "spice_brown")
add("spices", "SPC-003", "كمون مطحون", ["كمون"], [U("kg", 1, 45, 0.25, 0.25, True), U("pack", 0.1, 5.5)], "pack", "spice_brown")
add("spices", "SPC-004", "فلفل أسود مطحون", ["فلفل اسود", "بهار اسود"], [U("kg", 1, 60, 0.25, 0.25, True), U("pack", 0.1, 7)], "pack", "spice_dark")
add("spices", "SPC-005", "كركم مطحون", ["كركم", "عقدة صفرا"], [U("kg", 1, 35, 0.25, 0.25, True), U("pack", 0.1, 4.5)], "pack", "spice_yellow")
add("spices", "SPC-006", "سماق", ["سماق بلدي"], [U("kg", 1, 40, 0.25, 0.25, True), U("pack", 0.1, 5)], "pack", "spice_red")
add("spices", "SPC-007", "ملح ليمون", ["ليمون ملح", "حامض ليمون"], [U("pack", 1, 3), U("carton", 50, 135)], "pack", "spice_white")
add("spices", "SPC-008", "خميرة فورية 11 غرام", ["خميرة", "خميره"], [U("pack", 1, 1.5), U("box", 20, 27)], "box", "yeast")
add("spices", "SPC-009", "مرقة دجاج مكعبات", ["ماجي", "مرقة", "مكعبات"], [U("box", 1, 4), U("carton", 24, 90)], "carton", "stock_cube")
add("spices", "SPC-010", "قرفة مطحونة", ["قرفه", "دارسين"], [U("kg", 1, 50, 0.25, 0.25, True), U("pack", 0.1, 6)], "pack", "spice_brown")

from collections import Counter
c = Counter(p["categoryId"] for p in P)
assert all(v >= 10 for v in c.values()), c
assert len({p["sku"] for p in P}) == len(P)
for p in P:
    ids = [u["unitId"] for u in p["units"]]
    assert p["defaultUnitId"] in ids, p["sku"]
    assert len(ids) == len(set(ids)), p["sku"]
json.dump({"source": {"unicef": "UNICEF State of Palestine — Market Monitoring: Food & Non-Food Items, Gaza Strip, 25–27 Aug 2026 (median retail prices, ILS)", "estimate": "تقدير مبدئي يراجعه المالك قبل النشر"}, "products": P}, open("catalog/seed.json", "w"), ensure_ascii=False, indent=1)
print(len(P), dict(c), "unicef:", sum(p["priceSource"] == "unicef" for p in P))
