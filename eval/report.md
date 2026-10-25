# Built-in nutrition values vs USDA FoodData Central

Run 2026-10-25. Compared 475 foods (350 with a confident name match); skipped 11.

Error = |built-in − USDA| ÷ USDA, with small floors (20 kcal, 2 g protein/fat/carbs, 1 g sat fat/fiber/sugar, 50 mg sodium) so tiny amounts don't dominate. USDA values are per 100 g, scaled to each serving's grams. Raw-vs-cooked and branded-vs-generic differences add error, so review the worst rows before changing data.

## Accuracy by nutrient (confident matches)

| Nutrient | Median error | Within 10% | Within 25% |
| --- | --- | --- | --- |
| Calories | 4% | 68% | 87% |
| Protein | 4% | 65% | 84% |
| Total fat | 4% | 64% | 79% |
| Saturated fat | 7% | 60% | 74% |
| Carbs | 4% | 66% | 82% |
| Fiber | 4% | 59% | 76% |
| Sugars | 5% | 58% | 76% |
| Sodium | 7% | 58% | 76% |

## Verdict agreement

316 of 350 confident matches (90%) get the same verdict with USDA's numbers.

| Food | Built-in verdict | With USDA numbers | USDA record |
| --- | --- | --- | --- |
| Dried mango, sweetened | In moderation | Limit it | Mango, Dried, Sweetened (169091) |
| Potato, baked | Get it | In moderation | Potato, Baked, Nfs (2709383) |
| Hash browns, frozen | In moderation | Get it | Potatoes, Hash Brown, Frozen, Plain, Unprepared (170043) |
| Sweet potato fries, frozen | In moderation | Get it | Sweet Potato Fries, Frozen (2709711) |
| Spaghetti squash | Get it | In moderation | Spaghetti Squash, Cooked (2710001) |
| Chicken nuggets, frozen | In moderation | Limit it | Chicken Nuggets, from Frozen (2706096) |
| Beef jerky | In moderation | Limit it | Beef Jerky (2705860) |
| Chicken sausage | Limit it | In moderation | Turkey or Chicken Sausage (2706200) |
| Catfish | Get it | In moderation | Fish, Catfish, Nfs (2706234) |
| Smoked salmon | In moderation | Get it | Fish, Salmon, Chinook, Smoked (173687) |
| Silken tofu | In moderation | Get it | Mori-Nu, Tofu, Silken, Firm (172461) |
| Eggs | In moderation | Get it | Eggs, Grade a, Large, Egg White (747997) |
| Skim milk | Get it | In moderation | Milk, Fat Free (Skim) (2705388) |
| Almond milk, unsweetened | Get it | In moderation | Almond Milk, Unsweetened, Plain, Refrigerated (2257045) |
| Cream cheese | In moderation | Limit it | Cheese, Cream (173418) |
| Half and half | In moderation | Get it | Beef, Brisket, Flat Half, Boneless, Separable Lean Only, Trimmed to 0" (168657) |
| Cottage cheese 4% | In moderation | Get it | Cheese, Cottage, Lowfat, 2% Milkfat (328841) |
| Greek yogurt, vanilla | Get it | In moderation | Yogurt, Greek, Vanilla, Lowfat (170907) |
| French toast | Limit it | In moderation | French Toast, Nfs (2708331) |
| Sunflower seeds | Get it | In moderation | Seeds, Sunflower Seed, Kernel, Raw (2515381) |
| Potato chips | In moderation | Limit it | Potato Chips, Nfs (2709421) |
| Whole grain crackers | Get it | In moderation | Crackers, Cheese, Whole Grain (174084) |
| Graham crackers | Limit it | In moderation | Nabisco, Nabisco Grahams Crackers (175083) |
| Soda | Limit it | Fine | Beverages, Carbonated, Club Soda (174842) |
| Apple juice | In moderation | Limit it | Apple Juice, 100% (2709320) |
| Chicken noodle soup, canned | Limit it | In moderation | Soup, Chicken Noodle, Canned (2709148) |
| California roll | Get it | In moderation | Sushi Roll, California (2708961) |
| Chicken sandwich, fried | Limit it | In moderation | Chicken Fillet Sandwich, Fried, on Wheat Bun (2707010) |
| Grilled chicken sandwich | In moderation | Get it | Chicken Fillet Sandwich, Grilled, on Wheat Bun (2707014) |
| Chicken burrito bowl | In moderation | Limit it | Burrito Bowl, Chicken (2708560) |
| Chicken enchiladas, red sauce | In moderation | Limit it | Enchilada Sauce, Red (2709741) |
| Caesar dressing | Limit it | In moderation | Caesar Dressing (2710199) |
| Brown gravy | In moderation | Limit it | Gravy, Brown, Dry (171565) |
| Molasses | Limit it | In moderation | Molasses (168820) |

## Largest differences (confident matches)

| Food | Worst nutrient | Built-in | USDA | USDA record |
| --- | --- | --- | --- | --- |
| Soda | Sugars (3900%) | 39 | 0 | Beverages, Carbonated, Club Soda (174842) |
| Chicken burrito bowl | Carbs (3272%) | 67 | 1.6 | Burrito Bowl, Chicken (2708560) |
| Chicken enchiladas, red sauce | Protein (1413%) | 30 | 1.7 | Enchilada Sauce, Red (2709741) |
| Cornbread | Sugars (588%) | 6 | 0.1 | Chicken Cornbread (2708745) |
| Hash browns, frozen | Sodium (532%) | 280 | 14.1 | Potatoes, Hash Brown, Frozen, Plain, Unprepared (170043) |
| Pretzels | Sodium (516%) | 350 | 56.8 | Pretzels, Soft (169064) |
| Peanuts, dry roasted | Sodium (457%) | 230 | 1.7 | Peanuts, All Types, Dry-Roasted, without Salt (173806) |
| Egg roll | Total fat (433%) | 10 | 1.3 | Wonton Wrappers (Includes Egg Roll Wrappers) (172802) |
| Salami | Saturated fat (320%) | 3.2 | 0 | Salami, Hard, Sliced (2759005) |
| Bologna | Saturated fat (300%) | 3 | 0 | Bologna, Beef (2758991) |
| Pulled pork, no sauce | Saturated fat (298%) | 6.3 | 1.6 | Pulled Pork in Barbecue Sauce (173344) |
| California roll | Total fat (298%) | 7 | 1 | Sushi Roll, California (2708961) |
| Ranch dressing | Saturated fat (250%) | 2.5 | 0 | Dressing, Ranch (2758988) |
| Eggs | Total fat (240%) | 4.8 | 0 | Eggs, Grade a, Large, Egg White (747997) |
| Pistachios | Sodium (240%) | 120 | 0 | Nuts, Pistachio Nuts, Raw (2515379) |
| Smoked salmon | Sodium (200%) | 1130 | 376.3 | Fish, Salmon, Chinook, Smoked (173687) |
| Chicken sausage | Sugars (200%) | 2 | 0 | Turkey or Chicken Sausage (2706200) |
| Soy milk, unsweetened | Fiber (200%) | 2 | 0 | Soy Milk, Unsweetened (2705405) |
| Whey protein powder | Sugars (200%) | 2 | 0 | Beverages, Protein Powder Whey Based (173180) |
| Hard seltzer | Sugars (200%) | 2 | 0 | Hard Seltzer (2710622) |
| Italian dressing | Total fat (199%) | 6 | 2 | Italian Dressing, Light (2710224) |
| Cheese puffs | Total fat (195%) | 10 | 3.4 | Cheese Puffs and Twists, Corn Based, Baked, Low Fat (168860) |
| Pancakes | Sugars (192%) | 6 | 2.1 | Potato Pancakes (170092) |
| Grilled chicken sandwich | Sugars (175%) | 11 | 4 | Chicken Fillet Sandwich, Grilled, on Wheat Bun (2707014) |
| Biscuit, refrigerated | Saturated fat (172%) | 2.5 | 0.8 | Biscuits, Mixed Grain, Refrigerated Dough (172671) |

## Uncertain name matches (excluded above)

Pin the right record in eval/usda-map.json and rerun.

| Food | Top USDA result |
| --- | --- |
| Pomegranate seeds | Pomegranates, Raw (169134) |
| Fruit cup in juice | Fruit Juice, Nfs (2709315) |
| Frozen mixed berries | Berries, Frozen (2709272) |
| Salsa, mild | Salsa, Nfs (2709736) |
| Snap peas | Peas, Green, Raw (170419) |
| Spring mix | Onions, Spring or Scallions (Includes Tops and Bulb), Raw (170005) |
| Artichoke hearts, canned | Jerusalem-Artichokes, Raw (169236) |
| Cauliflower rice | Cauliflower, Raw (2685573) |
| Tater tots | Potato Tots, Nfs (2709511) |
| Collard greens, cooked | Collards, Ns as to Form, Cooked (2709579) |
| Daikon radish | Radishes, Raw (169276) |
| Chicken breast, grilled | Chicken, Broiler or Fryers, Breast, Skinless, Boneless, Meat Only, Coo (171534) |
| Rotisserie chicken, breast meat | Chicken, Broilers or Fryers, Rotisserie, Original Seasoning, Breast, M (171123) |
| Pork breakfast sausage | Pork Sausage, Reduced Sodium, Cooked (173882) |
| Turkey burger patty | Turkey, Ground, Fat Free, Patties, Broiled (172849) |
| Canned chicken breast | Lunchmeat, Chicken Breast, Sliced (2759004) |
| New York strip steak | Beef, Steak, Strip, Ns as to Fat Eaten (2705835) |
| Filet mignon | Beef, Top Loin Filet, Boneless, Separable Lean and Fat, Trimmed to 1/8 (173064) |
| Grilled chicken nuggets | Chicken Fillet, Grilled (2706090) |
| Mahi-mahi | Mahi Mahi, Frozen, Wild Caught (2747658) |
| Tuna steak | Fish, Tuna, Cooked (2706310) |
| Crab meat | Imitation Crab Meat (2706568) |
| Breaded shrimp, frozen | T.g.i. Friday's, Friday's Shrimp, Breaded (169832) |
| Crawfish, boiled | Chicken, Feet, Boiled (171119) |
| Plant-based burger | Burger King, Onion Rings (170771) |
| Seitan | Meat Substitute, Cereal- and Vegetable Protein-Based, Fried (2709163) |
| Chickpea pasta | Chickpeas, Nfs (2707414) |
| Kefir, plain low-fat | Buttermilk, Low Fat (2259792) |
| Skyr, plain nonfat | Croutons, Plain (172751) |
| String cheese | Cheese, Monterey (2705720) |
| Pepper jack cheese | Cheese, Monterey Jack, Solid (2647438) |
| Whipped cream, aerosol | Cream, Whipped (2705598) |
| Ultra-filtered 2% milk | Egg Custards, Dry Mix, Prepared with 2% Milk (168787) |
| Oatmeal, rolled oats | Oats, Whole Grain, Rolled, Old Fashioned (2346396) |
| Bagel, plain | Snacks, Bagel Chips, Plain (173150) |
| Pita, whole wheat | Bread, Pita, Whole-Wheat (174916) |
| Toasted oat cereal, plain | Cereals, Oats, Instant, Fortified, Plain, Dry (171661) |
| Jasmine rice | Dirty Rice (2709078) |
| Udon noodles | Noodles, Cooked (2708352) |
| Naan | Bread, Naan (2707613) |
| Low-carb tortilla | Buttermilk, Low Fat (2259792) |
| Instant oatmeal, flavored | Cereals, Quaker, Instant Oatmeal Organic, Regular (174660) |
| Sprouted grain bread | Bread, Wheat, Sprouted (171850) |
| Protein pancake mix | Pancakes, Buckwheat, Dry Mix, Incomplete (172774) |
| Overnight oats | Oat Milk (2705412) |
| Powdered peanut butter | Peanut Butter, Creamy (2262072) |
| Plant protein powder | Protein Supplement, Milk Based, Muscle Milk, Powder (173459) |
| Protein chips | Bean Chips (2707428) |
| Casein protein powder | Protein Supplement, Milk Based, Muscle Milk, Powder (173459) |
| Microwave popcorn, butter | Popcorn, Microwave, Nfs (2708223) |
| Glazed donut | Doughnuts, French Crullers, Glazed (172756) |
| Gummy bears | Bear (2705918) |
| Brownie | Cookies, Brownies, Commercially Prepared (172713) |
| Fruit popsicle | Popsicle (2710320) |
| Veggie straws | Mushrooms, Straw, Canned, Drained Solids (168582) |
| Kettle corn | Corn Grain, White (168920) |
| Seaweed snacks | Seaweed, Agar, Raw (169280) |
| Beef stick | Bacon and Beef Sticks (174602) |
| Fig bars | Cookies, Fig Bars (172721) |
| Hot chocolate, from mix | Potato, Scalloped, from Dry Mix (2709452) |
| Vanilla milkshake | Vanilla Extract (173471) |
| Rice crispy treat | Cereal, Rice Crispy, Plain (2708455) |
| Mochi ice cream | Ice Creams, Vanilla (167575) |
| Cinnamon roll, refrigerated | Egg Rolls, Chicken, Refrigerated, Heated (172104) |
| Tres leches cake | Cake, Tres Leche (2707889) |
| Bao, BBQ pork | Frankfurter, Pork (172964) |
| Coffee, black | Coffee, Brewed (2710375) |
| Latte, whole milk | Milk, Whole (2705385) |
| Sweet tea | Tea, Ginger (2710507) |
| Bubble milk tea, regular sugar | Tea, Bubble (2710508) |
| Bubble milk tea, half sugar | Tea, Bubble (2710508) |
| Thai iced tea | Tea, Iced, Bottled, Green (2710533) |
| Diet soda | Soft Drink, Cream Soda, Diet (2710550) |
| Sparkling water | Beverages, Gerolsteiner Brunnen Gmbh & Co. Kg,Gerolsteiner Naturally S (174827) |
| Bottled iced coffee drink | Beverages, Coffee, Ready to Drink, Iced, Mocha, Milk Based (174119) |
| Electrolyte drink, zero sugar | Beverages, Energy Drink, Vault Zero, Sugar-Free, Citrus Flavor (174177) |
| Liquor shot | Beverages, Malt Liquor Beverage (171907) |
| Pumpkin spice latte | Pumpkin, Raw (168448) |
| Iced caramel macchiato | Candies, Caramels (167974) |
| Cold brew coffee | Coffee, Brewed (2710375) |
| Chicken broth | Chicken, Canned, No Broth (171110) |
| Bone broth | Fish Broth (171606) |
| Matcha latte, sweetened | Apricots, Frozen, Sweetened (171703) |
| Instant ramen | Beverages, Tea, Instant, Decaffeinated, Unsweetened (174872) |
| Frozen chicken and rice bowl | Rice Bowl with Chicken, Frozen Entree, Prepared (Includes Fried, Teriy (173339) |
| Mac and cheese, boxed | Mcdonald's, Big Mac (170720) |
| Beef pho | Beef, Nfs (2705822) |
| Chicken fried rice | Rice, Fried, Nfs (2708952) |
| Chicken tikka masala | Chicken, Meatless (169886) |
| Caesar salad | Salad Dressing, Caesar Dressing, Regular (169055) |
| Turkey sub, 6-inch | Fat, Turkey (173571) |
| Breakfast sandwich, sausage and egg | Egg White Sandwich (2707334) |
| Chicken salad, deli | Chicken, Prepackaged or Deli, Luncheon Meat (2706208) |
| Crunchy beef taco, fast food | Fast Foods, Chicken Tenders (173321) |
| Pepperoni pizza, restaurant | Pizza Hut 12" Pepperoni Pizza, Pan Crust (173280) |
| Greek salad | Greek Salad, No Dressing (2709830) |
| Breakfast taco, egg and cheese | Taco, Cheese Only (2708533) |
| Chicken fajita bowl | Fajita, Chicken (2708604) |
| Brisket sandwich | Sandwich, Nfs (2706880) |
| Kolache, sausage | Blood Sausage (171618) |
| Chicken fried steak with gravy | Chicken with Gravy (2706428) |
| Banh mi, grilled pork | Kielbasa, Fully Cooked, Grilled (173877) |
| Chicken pho | Chicken, Meatless (169886) |
| Congee with chicken | Congee, with Egg (2708984) |
| Fresh spring rolls | Basil, Fresh (172232) |
| Vermicelli bowl, grilled pork | Scallops, Grilled (2706357) |
| Poke bowl, ahi tuna | Tuna, Ahi or Yellowfin, Frozen, Wild Caught (2747673) |
| Chicken Caesar salad kit | Salad Dressing, Caesar Dressing, Regular (169055) |
| Protein snack box, turkey and cheese | Macaroni and Cheese, Box Mix with Cheese Sauce, Prepared (169770) |
| Sriracha | Sauce, Hot Chile, Sriracha, Tuong Ot Sriracha (171188) |
| Alfredo sauce, jarred | Alfredo Sauce (2705809) |
| Balsamic vinaigrette | Vinegar, Balsamic (172241) |
| BBQ sauce | Barbecue Sauce (2709750) |
| Pesto | Pesto Sauce (2710175) |
| Sweet chili sauce | Applebee's, Chili (169018) |
| Tzatziki | Tzatziki Dip (2705448) |
| Zero-calorie sweetener | Beverages, Powerade Zero Ion4, Calorie-Free, Assorted Flavors (171923) |
| Ghee | Butter, Clarified Butter (Ghee) (171314) |
| MCT oil | Oil, Corn (748323) |
| Cooking spray | Oil, Pam Cooking Spray, Original (171430) |
| Monk fruit sweetener | Cranberries, Dried, Sweetened (2758976) |
| Stevia sweetener | Sweetener, Herbal Extract Powder from Stevia Leaf (170679) |
| Coconut sugar | Sugars, Granulated (746784) |
| Miso paste | Miso (172442) |
| Coconut milk, canned | Coconut Milk (2705413) |

## Next step

197 confident matches differ by more than 25% on at least one nutrient. Their USDA numbers, scaled to each serving, are in eval/suggested-values.json. Review each one (raw vs cooked, brand vs generic) before updating js/foods.js, then run `npm run snapshot` and review the verdict changes.

## Skipped

- Jalapeño: no USDA result
- Elote: no USDA result
- Ground beef 80/20: HTTP 400: <html> <head><title>400 Bad Request</title></head> <body> <center><h1>400 Bad Request</h1></center> <hr><center>ngin
- Ground beef 93/7: HTTP 400: {"error":"Bad Request","message":"Invalid request. Please try again."}
- Ground turkey 93/7: HTTP 400: {"error":"Bad Request","message":"Invalid request. Please try again."}
- Ground beef 90/10: HTTP 400: <html> <head><title>400 Bad Request</title></head> <body> <center><h1>400 Bad Request</h1></center> <hr><center>ngin
- Ground beef 85/15: HTTP 400: {"error":"Bad Request","message":"Invalid request. Please try again."}
- Ground turkey 85/15: HTTP 400: <html> <head><title>400 Bad Request</title></head> <body> <center><h1>400 Bad Request</h1></center> <hr><center>ngin
- Collagen peptides: no USDA result
- Erythritol: no USDA result
- Allulose: no USDA result
