/**
 * Translations for the most common CoFID food names. Only exact matches are
 * translated: anything not listed here (and every Open Food Facts product name)
 * keeps its English name, so a user never sees a half-translated or guessed
 * food. Keys must match `cofid-foods.json` exactly; scripts/check-food-names.mjs
 * enforces that.
 */

import type { Locale } from '@/i18n/locales';

type Names = Partial<Record<Locale, string>>;

// Order of languages in each row: bn, de, es, fr, hi, it, pa, pl, pt, ur.
const ROWS: Array<[string, [string, string, string, string, string, string, string, string, string, string]]> = [
  ['Apples, eating, raw, flesh and skin', ['আপেল', 'Äpfel', 'Manzanas', 'Pommes', 'सेब', 'Mele', 'ਸੇਬ', 'Jabłka', 'Maçãs', 'سیب']],
  ['Bananas, flesh only', ['কলা', 'Bananen', 'Plátanos', 'Bananes', 'केले', 'Banane', 'ਕੇਲੇ', 'Banany', 'Bananas', 'کیلے']],
  ['Oranges, flesh only', ['কমলালেবু', 'Orangen', 'Naranjas', 'Oranges', 'संतरे', 'Arance', 'ਸੰਤਰੇ', 'Pomarańcze', 'Laranjas', 'سنگترے']],
  ['Strawberries, raw', ['স্ট্রবেরি', 'Erdbeeren', 'Fresas', 'Fraises', 'स्ट्रॉबेरी', 'Fragole', 'ਸਟ੍ਰਾਬੇਰੀ', 'Truskawki', 'Morangos', 'اسٹرابیری']],
  ['Grapes, average', ['আঙুর', 'Weintrauben', 'Uvas', 'Raisins', 'अंगूर', 'Uva', 'ਅੰਗੂਰ', 'Winogrona', 'Uvas', 'انگور']],
  ['Kiwi fruit, flesh only, raw', ['কিউই', 'Kiwi', 'Kiwi', 'Kiwi', 'कीवी', 'Kiwi', 'ਕੀਵੀ', 'Kiwi', 'Kiwi', 'کیوی']],
  ['Pineapple, flesh only, raw', ['আনারস', 'Ananas', 'Piña', 'Ananas', 'अनानास', 'Ananas', 'ਅਨਾਨਾਸ', 'Ananas', 'Ananás', 'انناس']],
  ['Melon, flesh only, average', ['খরমুজা', 'Melone', 'Melón', 'Melon', 'खरबूजा', 'Melone', 'ਖਰਬੂਜਾ', 'Melon', 'Melão', 'خربوزہ']],
  ['Mangoes, ripe, flesh only, raw', ['আম', 'Mangos', 'Mangos', 'Mangues', 'आम', 'Mango', 'ਅੰਬ', 'Mango', 'Mangas', 'آم']],
  ['Pears, average, raw, flesh only', ['নাশপাতি', 'Birnen', 'Peras', 'Poires', 'नाशपाती', 'Pere', 'ਨਾਸ਼ਪਾਤੀ', 'Gruszki', 'Pera', 'ناشپاتی']],
  ['Avocado, Hass, flesh only', ['অ্যাভোকাডো', 'Avocado', 'Aguacate', 'Avocat', 'एवोकाडो', 'Avocado', 'ਐਵੋਕਾਡੋ', 'Awokado', 'Abacate', 'ایوکاڈو']],
  ['Peppers, capsicum, green, raw', ['সবুজ ক্যাপসিকাম', 'Grüne Paprika', 'Pimiento verde', 'Poivron vert', 'हरी शिमला मिर्च', 'Peperone verde', 'ਹਰੀ ਸ਼ਿਮਲਾ ਮਿਰਚ', 'Zielona papryka', 'Pimento verde', 'ہری شملہ مرچ']],
  ['Cucumber, raw, flesh and skin', ['শসা', 'Gurke', 'Pepino', 'Concombre', 'खीरा', 'Cetriolo', 'ਖੀਰਾ', 'Ogórek', 'Pepino', 'کھیرا']],
  ['Lettuce, average, raw', ['লেটুস', 'Kopfsalat', 'Lechuga', 'Laitue', 'सलाद पत्ता', 'Lattuga', 'ਸਲਾਦ ਪੱਤਾ', 'Sałata', 'Alface', 'سلاد کے پتے']],
  ['Tomatoes, standard, raw', ['টমেটো', 'Tomaten', 'Tomates', 'Tomates', 'टमाटर', 'Pomodori', 'ਟਮਾਟਰ', 'Pomidory', 'Tomates', 'ٹماٹر']],
  ['Onions, raw', ['পেঁয়াজ', 'Zwiebeln', 'Cebollas', 'Oignons', 'प्याज', 'Cipolle', 'ਪਿਆਜ਼', 'Cebula', 'Cebolas', 'پیاز']],
  ['Potatoes, old, raw, flesh only', ['আলু', 'Kartoffeln', 'Patatas', 'Pommes de terre', 'आलू', 'Patate', 'ਆਲੂ', 'Ziemniaki', 'Batatas', 'آلو']],
  ['Carrots, young, raw', ['গাজর', 'Karotten', 'Zanahorias', 'Carottes', 'गाजर', 'Carote', 'ਗਾਜਰ', 'Marchew', 'Cenouras', 'گاجر']],
  ['Broccoli, green, raw', ['ব্রকোলি', 'Brokkoli', 'Brócoli', 'Brocoli', 'ब्रोकली', 'Broccoli', 'ਬਰੋਕਲੀ', 'Brokuły', 'Brócolos', 'بروکلی']],
  ['Cabbage, white, raw', ['বাঁধাকপি', 'Weißkohl', 'Repollo blanco', 'Chou blanc', 'पत्ता गोभी', 'Cavolo bianco', 'ਬੰਦ ਗੋਭੀ', 'Kapusta biała', 'Repolho branco', 'بند گوبھی']],
  ['Cauliflower, raw', ['ফুলকপি', 'Blumenkohl', 'Coliflor', 'Chou-fleur', 'फूलगोभी', 'Cavolfiore', 'ਫੁੱਲ ਗੋਭੀ', 'Kalafior', 'Couve-flor', 'پھول گوبھی']],
  ['Courgette, raw', ['জুকিনি', 'Zucchini', 'Calabacín', 'Courgette', 'ज़ुकीनी', 'Zucchine', 'ਜ਼ੁਕੀਨੀ', 'Cukinia', 'Abobrinha', 'زوکینی']],
  ['Spinach, baby, raw', ['পালং শাক', 'Spinat', 'Espinacas', 'Épinards', 'पालक', 'Spinaci', 'ਪਾਲਕ', 'Szpinak', 'Espinafres', 'پالک']],
  ['Peas, raw', ['মটরশুঁটি', 'Erbsen', 'Guisantes', 'Petits pois', 'मटर', 'Piselli', 'ਮਟਰ', 'Groszek', 'Ervilhas', 'مٹر']],
  ['Sweetcorn, kernels, raw', ['ভুট্টা', 'Mais', 'Maíz dulce', 'Maïs doux', 'मक्का', 'Mais dolce', 'ਮੱਕੀ', 'Kukurydza', 'Milho doce', 'مکئی']],
  ['Lentils, red, split, dried, raw', ['মসুর ডাল', 'Rote Linsen', 'Lentejas rojas', 'Lentilles corail', 'मसूर दाल', 'Lenticchie rosse', 'ਮਸਰ ਦਾਲ', 'Soczewica czerwona', 'Lentilhas vermelhas', 'مسور کی دال']],
  ['Rice, white, long grain, raw', ['সাদা চাল', 'Weißer Reis', 'Arroz blanco', 'Riz blanc', 'सफ़ेद चावल', 'Riso bianco', 'ਚਿੱਟੇ ਚੌਲ', 'Ryż biały', 'Arroz branco', 'سفید چاول']],
  ['Rice, brown, wholegrain, raw', ['বাদামি চাল', 'Brauner Reis', 'Arroz integral', 'Riz complet', 'भूरे चावल', 'Riso integrale', 'ਭੂਰੇ ਚੌਲ', 'Ryż brązowy', 'Arroz integral', 'براؤن چاول']],
  ['Pasta, white, dried, raw', ['পাস্তা', 'Nudeln', 'Pasta', 'Pâtes', 'पास्ता', 'Pasta', 'ਪਾਸਤਾ', 'Makaron', 'Massa', 'پاستا']],
  ['Porridge, made with water', ['পোরিজ', 'Haferbrei', 'Gachas de avena', 'Porridge', 'दलिया', 'Porridge', 'ਦਲੀਆ', 'Owsianka', 'Papas de aveia', 'دلیہ']],
  ['Porridge oats, unfortified', ['ওটস', 'Haferflocken', 'Avena', 'Flocons d’avoine', 'जई', 'Fiocchi d’avena', 'ਜਵੀ', 'Płatki owsiane', 'Aveia', 'جئی']],
  ['Milk, whole, pasteurised, average', ['দুধ (পুরো)', 'Vollmilch', 'Leche entera', 'Lait entier', 'पूरा दूध', 'Latte intero', 'ਪੂਰਾ ਦੁੱਧ', 'Mleko pełnotłuste', 'Leite gordo', 'مکمل دودھ']],
  ['Milk, semi-skimmed, pasteurised, average', ['দুধ (আধা-স্কিম)', 'Halbfettmilch', 'Leche semidesnatada', 'Lait demi-écrémé', 'अर्ध-मलाईरहित दूध', 'Latte parzialmente scremato', 'ਅੱਧ-ਸਕਿਮ ਦੁੱਧ', 'Mleko półtłuste', 'Leite meio-gordo', 'نیم چکنائی والا دودھ']],
  ['Yogurt, low fat, plain', ['দই (কম চর্বি)', 'Magerjoghurt, natur', 'Yogur natural bajo en grasa', 'Yaourt nature allégé', 'कम वसा वाला सादा दही', 'Yogurt magro naturale', 'ਘੱਟ ਚਰਬੀ ਵਾਲਾ ਸਾਦਾ ਦਹੀਂ', 'Jogurt naturalny, niskotłuszczowy', 'Iogurte natural magro', 'کم چکنائی والا سادہ دہی']],
  ['Cheese, Cheddar, English', ['চেডার পনির', 'Cheddar', 'Queso cheddar', 'Cheddar', 'चेडर चीज़', 'Cheddar', 'ਚੈਡਰ ਪਨੀਰ', 'Ser cheddar', 'Queijo cheddar', 'چیڈر پنیر']],
  ['Cheese, cottage, plain', ['কটেজ চিজ', 'Hüttenkäse', 'Queso cottage', 'Fromage cottage', 'कॉटेज चीज़', 'Formaggio cottage', 'ਕਾਟੇਜ ਪਨੀਰ', 'Serek wiejski', 'Queijo cottage', 'کاٹیج پنیر']],
  ['Butter, salted', ['মাখন (লবণযুক্ত)', 'Butter, gesalzen', 'Mantequilla con sal', 'Beurre demi-sel', 'नमकीन मक्खन', 'Burro salato', 'ਲੂਣ ਵਾਲਾ ਮੱਖਣ', 'Masło solone', 'Manteiga com sal', 'نمکین مکھن']],
  ['Butter, unsalted', ['মাখন (লবণবিহীন)', 'Butter, ungesalzen', 'Mantequilla sin sal', 'Beurre doux', 'बिना नमक का मक्खन', 'Burro non salato', 'ਬਿਨਾਂ ਲੂਣ ਦਾ ਮੱਖਣ', 'Masło niesolone', 'Manteiga sem sal', 'بغیر نمک کا مکھن']],
  ['Bread, white, sliced', ['সাদা পাউরুটি (স্লাইস)', 'Weißbrot, geschnitten', 'Pan blanco de molde', 'Pain blanc en tranches', 'सफ़ेद ब्रेड (स्लाइस)', 'Pane bianco a fette', 'ਚਿੱਟੀ ਬਰੈੱਡ (ਸਲਾਇਸ)', 'Chleb biały krojony', 'Pão branco de forma', 'سفید ڈبل روٹی (سلائس)']],
  ['Bread, wholemeal, average', ['আটার পাউরুটি', 'Vollkornbrot', 'Pan integral', 'Pain complet', 'साबुत गेहूं की ब्रेड', 'Pane integrale', 'ਸਾਬਤ ਕਣਕ ਦੀ ਬਰੈੱਡ', 'Chleb razowy', 'Pão integral', 'ثابت گندم کی ڈبل روٹی']],
  ['Chicken, meat, average, raw', ['মুরগির মাংস (কাঁচা)', 'Hähnchenfleisch, roh', 'Pollo, carne, cruda', 'Poulet, viande, cru', 'चिकन (कच्चा)', 'Pollo, carne, crudo', 'ਚਿਕਨ (ਕੱਚਾ)', 'Kurczak, mięso, surowe', 'Frango, carne, crua', 'چکن (کچا)']],
  ['Chicken, meat, average, roasted', ['মুরগির মাংস (রোস্ট)', 'Hähnchenfleisch, gebraten', 'Pollo, carne, asada', 'Poulet, viande, rôti', 'चिकन (भुना हुआ)', 'Pollo, carne, arrosto', 'ਚਿਕਨ (ਭੁੰਨਿਆ)', 'Kurczak, mięso, pieczone', 'Frango, carne, assada', 'چکن (بھنا ہوا)']],
  ['Chicken, breast, grilled without skin, meat only', ['মুরগির ব্রেস্ট (গ্রিল্ড)', 'Hähnchenbrust, gegrillt ohne Haut', 'Pechuga de pollo a la plancha sin piel', 'Blanc de poulet grillé sans peau', 'चिकन ब्रेस्ट (ग्रिल्ड, बिना त्वचा)', 'Petto di pollo alla griglia senza pelle', 'ਚਿਕਨ ਬ੍ਰੈਸਟ (ਗਰਿੱਲ, ਬਿਨਾਂ ਚਮੜੀ)', 'Pierś z kurczaka grillowana bez skóry', 'Peito de frango grelhado sem pele', 'چکن بریسٹ (گرِل، بغیر جلد)']],
  ['Beef, mince, raw', ['গরুর কিমা (কাঁচা)', 'Rinderhack, roh', 'Carne picada de ternera, cruda', 'Bœuf haché, cru', 'बीफ़ कीमा (कच्चा)', 'Carne macinata di manzo, cruda', 'ਬੀਫ਼ ਕੀਮਾ (ਕੱਚਾ)', 'Mięso mielone wołowe, surowe', 'Carne picada de vaca, crua', 'بیف قیمہ (کچا)']],
  ['Beef, lean, average, raw', ['গরুর মাংস (কাঁচা, চর্বিহীন)', 'Rindfleisch, mager, roh', 'Ternera magra, cruda', 'Bœuf maigre, cru', 'बीफ़ (कच्चा, दुबला)', 'Manzo magro, crudo', 'ਬੀਫ਼ (ਕੱਚਾ, ਪਤਲਾ)', 'Wołowina chuda, surowa', 'Vaca magra, crua', 'بیف (کچا، دبلا)']],
  ['Salmon, wild, grilled', ['স্যালমন (গ্রিল্ড)', 'Lachs, gegrillt', 'Salmón a la plancha', 'Saumon grillé', 'सालमन (ग्रिल्ड)', 'Salmone alla griglia', 'ਸੈਲਮਨ (ਗਰਿੱਲ)', 'Łosoś grillowany', 'Salmão grelhado', 'سالمن (گرِل)']],
  ['Tuna, canned in brine, drained', ['টুনা (ক্যানড, নিষ্কাশিত)', 'Thunfisch in Lake, abgetropft', 'Atún en salmuera, escurrido', 'Thon en saumure égoutté', 'टूना (डिब्बाबंद, पानी निथारा)', 'Tonno in salamoia, sgocciolato', 'ਟੂਨਾ (ਡੱਬਾਬੰਦ, ਨਿਤਾਰਿਆ)', 'Tuńczyk w zalewie, odsączony', 'Atum em salmoura, escorrido', 'ٹونا (ڈبہ بند، نکالا ہوا)']],
  ['Prawns, king, raw', ['চিংড়ি (কাঁচা)', 'Königsgarnelen, roh', 'Langostinos crudos', 'Gambas royales crues', 'झींगा (कच्चा)', 'Gamberi reali crudi', 'ਝੀਂਗਾ (ਕੱਚਾ)', 'Krewetki królewskie, surowe', 'Camarões reais crus', 'جھینگا (کچا)']],
  ['Cod, flesh only, raw', ['কড মাছ (কাঁচা)', 'Kabeljau, roh', 'Bacalao crudo', 'Cabillaud cru', 'कॉड मछली (कच्ची)', 'Merluzzo crudo', 'ਕੌਡ ਮੱਛੀ (ਕੱਚੀ)', 'Dorsz surowy', 'Bacalhau cru', 'کاڈ مچھلی (کچی)']],
  ['Haddock, flesh only, raw', ['হ্যাডক (কাঁচা)', 'Schellfisch, roh', 'Eglefino crudo', 'Aiglefin cru', 'हैडॉक (कच्चा)', 'Eglefino crudo', 'ਹੈਡਕ (ਕੱਚਾ)', 'Plamiak surowy', 'Hadoque cru', 'ہیڈاک (کچی)']],
  ['Beer, bitter, average (<4% ABV)', ['বিয়ার', 'Bier', 'Cerveza', 'Bière', 'बीयर', 'Birra', 'ਬੀਅਰ', 'Piwo', 'Cerveja', 'بیئر']],
  ['Wine, red', ['রেড ওয়াইন', 'Rotwein', 'Vino tinto', 'Vin rouge', 'रेड वाइन', 'Vino rosso', 'ਰੈੱਡ ਵਾਈਨ', 'Wino czerwone', 'Vinho tinto', 'ریڈ وائن']],
  ['Wine, white, dry', ['সাদা ওয়াইন', 'Weißwein', 'Vino blanco', 'Vin blanc', 'व्हाइट वाइन', 'Vino bianco', 'ਚਿੱਟੀ ਵਾਈਨ', 'Wino białe', 'Vinho branco', 'وائٹ وائن']],
  ['Coffee, infusion, average', ['কফি', 'Kaffee', 'Café', 'Café', 'कॉफ़ी', 'Caffè', 'ਕੌਫੀ', 'Kawa', 'Café', 'کافی']],
  ['Tea, infusion, average, with whole milk', ['চা (দুধসহ)', 'Tee mit Vollmilch', 'Té con leche entera', 'Thé au lait entier', 'दूध वाली चाय', 'Tè con latte intero', 'ਦੁੱਧ ਵਾਲੀ ਚਾਹ', 'Herbata z pełnym mlekiem', 'Chá com leite gordo', 'دودھ والی چائے']],
  ['Cola', ['কোলা', 'Cola', 'Cola', 'Cola', 'कोला', 'Cola', 'ਕੋਲਾ', 'Cola', 'Refrigerante de cola', 'کولا']],
  ['Potato crisps, fried in sunflower oil', ['আলুর চিপস', 'Kartoffelchips', 'Patatas fritas de bolsa', 'Chips', 'आलू चिप्स', 'Patatine', 'ਆਲੂ ਚਿਪਸ', 'Chipsy ziemniaczane', 'Batatas fritas de pacote', 'آلو کے چپس']],
  ['Chocolate, milk', ['দুধের চকোলেট', 'Milchschokolade', 'Chocolate con leche', 'Chocolat au lait', 'मिल्क चॉकलेट', 'Cioccolato al latte', 'ਦੁੱਧ ਵਾਲੀ ਚਾਕਲੇਟ', 'Czekolada mleczna', 'Chocolate de leite', 'ملک چاکلیٹ']],
  ['Chocolate, plain', ['ডার্ক চকোলেট', 'Zartbitterschokolade', 'Chocolate negro', 'Chocolat noir', 'डार्क चॉकलेट', 'Cioccolato fondente', 'ਡਾਰਕ ਚਾਕਲੇਟ', 'Czekolada gorzka', 'Chocolate negro', 'ڈارک چاکلیٹ']],
  ['Baked beans, canned in tomato sauce', ['বেকড বিনস (টমেটো সস)', 'Baked Beans in Tomatensauce', 'Alubias cocidas en salsa de tomate', 'Haricots blancs à la sauce tomate', 'बेक्ड बीन्स (टमाटर सॉस)', 'Fagioli al forno in salsa di pomodoro', 'ਬੇਕਡ ਬੀਨਜ਼ (ਟਮਾਟਰ ਸਾਸ)', 'Fasola w sosie pomidorowym', 'Feijão cozido em molho de tomate', 'بیکڈ بینز (ٹماٹر ساس)']],
  ['Biscuits, digestive, plain', ['ডাইজেস্টিভ বিস্কুট', 'Digestive-Kekse', 'Galletas digestivas', 'Biscuits digestifs', 'डाइजेस्टिव बिस्कुट', 'Biscotti digestive', 'ਡਾਇਜੈਸਟਿਵ ਬਿਸਕੁਟ', 'Herbatniki digestive', 'Bolachas digestivas', 'ڈائجیسٹو بسکٹ']],
  ['Almonds, whole kernels', ['বাদাম', 'Mandeln', 'Almendras', 'Amandes', 'बादाम', 'Mandorle', 'ਬਦਾਮ', 'Migdały', 'Amêndoas', 'بادام']],
  ['Walnuts, kernel only', ['আখরোট', 'Walnüsse', 'Nueces', 'Noix', 'अखरोट', 'Noci', 'ਅਖਰੋਟ', 'Orzechy włoskie', 'Nozes', 'اخروٹ']],
  ['Peanuts, dry roasted', ['চিনাবাদাম', 'Erdnüsse', 'Cacahuetes', 'Cacahuètes', 'मूंगफली', 'Arachidi', 'ਮੂੰਗਫਲੀ', 'Orzeszki ziemne', 'Amendoins', 'مونگ پھلی']],
  ['Raisins, dried', ['কিশমিশ', 'Rosinen', 'Pasas', 'Raisins secs', 'किशमिश', 'Uvetta', 'ਕਿਸ਼ਮਿਸ਼', 'Rodzynki', 'Passas', 'کشمش']],
  ['Honey', ['মধু', 'Honig', 'Miel', 'Miel', 'शहद', 'Miele', 'ਸ਼ਹਿਦ', 'Miód', 'Mel', 'شہد']],
  ['Sugar, white', ['চিনি', 'Zucker', 'Azúcar', 'Sucre', 'चीनी', 'Zucchero', 'ਖੰਡ', 'Cukier', 'Açúcar', 'چینی']],
  ['Sugar, brown', ['বাদামি চিনি', 'Brauner Zucker', 'Azúcar moreno', 'Sucre roux', 'भूरी चीनी', 'Zucchero di canna', 'ਭੂਰੀ ਖੰਡ', 'Cukier brązowy', 'Açúcar mascavo', 'براؤن چینی']],
  ['Ice cream, dairy, vanilla, soft scoop', ['আইসক্রিম (ভ্যানিলা)', 'Vanilleeis', 'Helado de vainilla', 'Glace à la vanille', 'वेनिला आइसक्रीम', 'Gelato alla vaniglia', 'ਵਨੀਲਾ ਆਈਸਕ੍ਰੀਮ', 'Lody waniliowe', 'Gelado de baunilha', 'ونیلا آئس کریم']],
  ['Pizza, cheese and tomato, retail', ['পিৎজা (চিজ ও টমেটো)', 'Pizza Käse-Tomate', 'Pizza de queso y tomate', 'Pizza fromage et tomate', 'पिज़्ज़ा (चीज़ और टमाटर)', 'Pizza margherita', 'ਪੀਜ਼ਾ (ਪਨੀਰ ਤੇ ਟਮਾਟਰ)', 'Pizza z serem i pomidorami', 'Pizza de queijo e tomate', 'پزا (پنیر اور ٹماٹر)']],
  ['Mayonnaise, standard, retail', ['মেয়োনেজ', 'Mayonnaise', 'Mayonesa', 'Mayonnaise', 'मेयोनेज़', 'Maionese', 'ਮੇਅਨੀਜ਼', 'Majonez', 'Maionese', 'مایونیز']],
  ['Muesli, Swiss style, unfortified', ['মুসলি', 'Müsli', 'Muesli', 'Muesli', 'म्यूसली', 'Muesli', 'ਮਿਊਸਲੀ', 'Musli', 'Muesli', 'میوزلی']],
  ['Sausages, pork, raw', ['সসেজ (শূকরের মাংস, কাঁচা)', 'Bratwurst, Schwein, roh', 'Salchichas de cerdo, crudas', 'Saucisses de porc crues', 'पोर्क सॉसेज (कच्चा)', 'Salsicce di maiale crude', 'ਪੋਰਕ ਸੌਸੇਜ (ਕੱਚੇ)', 'Kiełbaski wieprzowe, surowe', 'Salsichas de porco cruas', 'پورک ساسیج (کچی)']],
  ['Ham', ['হ্যাম', 'Schinken', 'Jamón', 'Jambon', 'हैम', 'Prosciutto cotto', 'ਹੈਮ', 'Szynka', 'Fiambre', 'ہیم']],
  ['Bacon rashers, back, grilled', ['বেকন (গ্রিল্ড)', 'Bacon, gegrillt', 'Bacon a la plancha', 'Bacon grillé', 'बेकन (ग्रिल्ड)', 'Bacon alla griglia', 'ਬੇਕਨ (ਗਰਿੱਲ)', 'Boczek grillowany', 'Bacon grelhado', 'بیکن (گرِل)']],
];

const LOCALE_KEYS = ['bn', 'de', 'es', 'fr', 'hi', 'it', 'pa', 'pl', 'pt', 'ur'] as const;

/** English CoFID name -> translations, keyed by locale. */
export const FOOD_NAMES: Record<string, Names> = Object.fromEntries(
  ROWS.map(([english, translations]) => [
    english,
    Object.fromEntries(LOCALE_KEYS.map((code, i) => [code, translations[i]])) as Names,
  ]),
);

/** Returns the translated food name, or the original when no translation exists. */
export function localiseFoodName(name: string, locale: Locale): string {
  if (locale === 'en') return name;
  return FOOD_NAMES[name]?.[locale] ?? name;
}
