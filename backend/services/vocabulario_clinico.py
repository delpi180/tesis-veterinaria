"""Terminología clínica veterinaria en español para reforzar el dictado.

Deepgram (nova-3) acepta como máximo ~500 tokens de "keyterms" por pedido, así
que no cabe todo. Por eso cada categoría va ORDENADA por prioridad (primero lo
que más se dicta y más se transcribe mal) y `vocabulario.keyterms` las mezcla
en ronda: si hay que cortar, quedan términos de todas las categorías y no solo
de la primera.

Solo van palabras que un reconocedor general suele destrozar: principios
activos, nombres científicos, eponimos, siglas y procedimientos. Palabras
corrientes ("vómitos", "diarrea") no se incluyen: reforzarlas es ruido y
puede sesgar al reconocedor.

Es una lista general de clínica de perros y gatos, no de un caso en particular.
"""

FARMACOS = [
    "metimazol", "levotiroxina", "trilostano", "pimobendán", "benazepril",
    "enalapril", "espironolactona", "amlodipino", "clopidogrel", "maropitant",
    "ondansetrón", "sucralfato", "fenbendazol", "pirantel", "praziquantel",
    "milbemicina", "selamectina", "fluralaner", "afoxolaner", "sarolaner",
    "isoxazolinas", "itraconazol", "ketoconazol", "terbinafina", "clotrimazol",
    "ciclosporina", "tacrolimus", "oclacitinib", "prednisolona", "firocoxib",
    "robenacoxib", "grapiprant", "buprenorfina", "butorfanol", "dexmedetomidina",
    "acepromazina", "alfaxalona", "fenobarbital", "levetiracetam", "metocarbamol",
    "apomorfina", "fitomenadiona", "mirtazapina", "ursodiol", "silimarina",
    "cefovecina", "marbofloxacina", "clindamicina", "azitromicina", "bedinvetmab",
    "lomustina", "vincristina", "remdesivir", "famciclovir", "carbón activado",
    "lactato de Ringer", "clorhexidina", "ceruminolítico", "tramadol", "gabapentina",
]

DIAGNOSTICOS = [
    "hipertiroidismo", "hipotiroidismo", "hiperadrenocorticismo", "hipoadrenocorticismo",
    "síndrome de Cushing", "enfermedad de Addison", "cetoacidosis diabética",
    "pancreatitis", "parvovirosis", "moquillo canino", "leptospirosis", "ehrlichiosis",
    "babesiosis", "leishmaniosis", "dirofilariosis", "giardiasis", "toxocariosis",
    "panleucopenia", "calicivirus", "leucemia felina", "inmunodeficiencia felina",
    "peritonitis infecciosa felina", "toxoplasmosis", "dermatitis atópica",
    "sarna demodécica", "otitis externa", "Malassezia", "Staphylococcus pseudintermedius",
    "dermatofitosis", "queratoconjuntivitis seca", "uveítis", "entropión",
    "piometra", "linfoma", "mastocitoma", "hemangiosarcoma", "osteosarcoma",
    "colapso traqueal", "quilotórax", "piotórax", "cardiomiopatía hipertrófica",
    "enfermedad mixomatosa de la válvula mitral", "dilatación-vólvulo gástrico",
    "intususcepción", "megacolon", "lipidosis hepática", "shunt portosistémico",
    "urolitiasis", "estruvita", "oxalato de calcio", "obstrucción uretral",
    "rotura del ligamento cruzado craneal", "luxación patelar", "displasia de cadera",
    "osteoartrosis", "hernia discal", "meningioma", "síndrome vestibular",
    "gingivostomatitis", "anemia hemolítica inmunomediada", "trombocitopenia",
    "rodenticidas anticoagulantes", "permetrinas", "golpe de calor",
]

PROCEDIMIENTOS = [
    "ovariohisterectomía", "orquiectomía", "gastropexia", "trocleoplastia",
    "toracocentesis", "abdominocentesis", "cistocentesis", "sondaje uretral",
    "ecocardiograma", "electrocardiograma", "coproparasitoscópico", "urianálisis",
    "antibiograma", "rinoscopia", "otoscopia", "tonometría", "test de Schirmer",
    "fluoresceína", "fructosamina", "curva de glucosa", "prueba de estimulación con ACTH",
    "supresión con dexametasona", "relación proteína creatinina", "SDMA",
    "hemograma", "perfil bioquímico", "hematocrito", "citología", "biopsia",
    "fluidoterapia", "oxigenoterapia", "transfusión", "profilaxis dental",
    "extracciones dentales", "enema", "drenaje",
]

SEMIOLOGIA = [
    "ptialismo", "tialismo", "poliuria", "polidipsia", "polifagia", "estranguria",
    "disuria", "polaquiuria", "hematuria", "tenesmo", "hematoquecia", "melena",
    "hematemesis", "epistaxis", "disnea", "taquipnea", "estertores", "borborigmos",
    "ascitis", "ictericia", "cianosis", "prurito", "alopecia", "eritema",
    "pústulas", "pápulas", "collarete epidérmico", "seborrea", "claudicación",
    "ataxia", "nistagmo", "paresia", "convulsiones focales", "halitosis",
    "uremia", "linfonódulos", "mucosas pálidas", "excoriaciones", "exudado ceruminoso",
    "tiempo de llenado capilar", "soplo sistólico", "arcadas", "regurgitación",
]

SIGLAS = ["AINEs", "ERC", "IRIS", "PIF", "FeLV", "FIV", "TPLO", "T4 libre", "ECA", "OVH"]

# El orden de las categorías decide quién queda primero al cortar.
CATEGORIAS = [FARMACOS, DIAGNOSTICOS, PROCEDIMIENTOS, SEMIOLOGIA, SIGLAS]
