/* ============================================================
   Central Cash & Carry — Product Catalog Data
   ------------------------------------------------------------
   This is the ONLY file you edit to change the catalog.
   Add one { ... } block per product, separated by commas.

   Fields:
     name      : product name (required)
     category  : must be one of:
                 "Foodservice & Restaurant"
                 "Packaging & Paper Goods"
                 "Cleaning, Party & Extras"
     desc      : short description (optional)
     price     : e.g. "$58.00" or "Call for price" or "" to hide
     inStock   : true or false
     image     : photo filename in the images folder, e.g.
                 "images/hot-cups.jpg"  — or "" for a placeholder

   These are SAMPLE products so you can preview the page.
   Replace them with your real items (or send me the filled-in
   spreadsheet and I'll generate this list for you).
   ============================================================ */

window.PRODUCTS = [
  // ---------- Foodservice & Restaurant ----------
  { name: "16 oz Paper Hot Cups (1000 ct)", category: "Foodservice & Restaurant", desc: "White double-wall paper cups, case of 1000.", price: "$58.00", inStock: true, image: "" },
  { name: "Clear Plastic Deli Containers, 8 oz (240 ct)", category: "Foodservice & Restaurant", desc: "Stackable containers with snap-on lids.", price: "$32.50", inStock: true, image: "" },
  { name: "Kraft Pizza Boxes, 16\" (50 ct)", category: "Foodservice & Restaurant", desc: "Corrugated takeout pizza boxes.", price: "$41.00", inStock: true, image: "" },
  { name: "Wrapped Plastic Cutlery Kits (500 ct)", category: "Foodservice & Restaurant", desc: "Fork, knife, napkin — individually wrapped.", price: "$36.75", inStock: false, image: "" },
  { name: "Foam Hinged Takeout Containers (200 ct)", category: "Foodservice & Restaurant", desc: "3-compartment clamshell to-go boxes.", price: "$28.00", inStock: true, image: "" },
  { name: "Commercial Coffee Brewer", category: "Foodservice & Restaurant", desc: "Pour-over style brewer with warmers.", price: "Call for price", inStock: true, image: "" },

  // ---------- Packaging & Paper Goods ----------
  { name: "Kraft Paper Bags #4 (500 ct)", category: "Packaging & Paper Goods", desc: "Heavy-duty brown grocery bags.", price: "$24.00", inStock: false, image: "" },
  { name: "Thank You T-Shirt Bags (1000 ct)", category: "Packaging & Paper Goods", desc: "Plastic carryout bags with handles.", price: "$22.50", inStock: true, image: "" },
  { name: "Dinner Napkins, 1-Ply (6000 ct)", category: "Packaging & Paper Goods", desc: "Bulk case of white dinner napkins.", price: "$34.00", inStock: true, image: "" },
  { name: "Clear Packing Tape (36 rolls)", category: "Packaging & Paper Goods", desc: "2\" carton-sealing tape, case of 36.", price: "$29.99", inStock: true, image: "" },
  { name: "Aluminum Foil Roll, 18\" x 1000'", category: "Packaging & Paper Goods", desc: "Heavy-duty foodservice foil.", price: "$31.25", inStock: true, image: "" },

  // ---------- Cleaning, Party & Extras ----------
  { name: "Trash Can Liners, 55 Gal (100 ct)", category: "Cleaning, Party & Extras", desc: "Heavy black can liners for back-of-house.", price: "$19.99", inStock: true, image: "" },
  { name: "Multi-Surface Cleaner, 1 Gal (4 ct)", category: "Cleaning, Party & Extras", desc: "Concentrated all-purpose cleaner.", price: "$26.00", inStock: true, image: "" },
  { name: "Plastic Table Covers, Assorted Colors", category: "Cleaning, Party & Extras", desc: "Disposable party table covers.", price: "Call for price", inStock: true, image: "" },
  { name: "Paper Towel Rolls (30 ct)", category: "Cleaning, Party & Extras", desc: "2-ply kitchen rolls, bulk case.", price: "$27.50", inStock: false, image: "" },
  { name: "Disposable Latex-Free Gloves (1000 ct)", category: "Cleaning, Party & Extras", desc: "Powder-free foodservice gloves.", price: "$33.00", inStock: true, image: "" }
];
