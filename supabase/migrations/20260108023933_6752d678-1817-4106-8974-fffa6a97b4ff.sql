-- Update all 320 questions' answer options to match the new standardized format
-- Format: L10 (value -10), L5 (value -5), C0 (value 0), R5 (value 5), R10 (value 10)

-- =====================================================
-- AGRICULTURE AND FOOD (aaf01-aaf10)
-- =====================================================

-- aaf01: Should the federal government expand subsidies for sustainable farming practices?
UPDATE question_options SET text = 'Yes—because rapid scaling of sustainable farming is urgent.' WHERE question_id = 'aaf01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize support for small and sustainable farms.' WHERE question_id = 'aaf01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted incentives without major expansion.' WHERE question_id = 'aaf01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited incentives where cost-effective.' WHERE question_id = 'aaf01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because subsidies should be minimized.' WHERE question_id = 'aaf01' AND value = 10 AND is_skip_option = false;

-- aaf02: Should crop insurance programs be increased to protect small farmers from climate risks?
UPDATE question_options SET text = 'Yes—because climate shocks require strong federal protection.' WHERE question_id = 'aaf02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus increases on small farms.' WHERE question_id = 'aaf02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest, targeted adjustments.' WHERE question_id = 'aaf02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current protections.' WHERE question_id = 'aaf02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because insurance should be private.' WHERE question_id = 'aaf02' AND value = 10 AND is_skip_option = false;

-- aaf03: Should the government limit the use of certain pesticides linked to health risks?
UPDATE question_options SET text = 'Yes—because public health should override industry use.' WHERE question_id = 'aaf03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but only for clearly high-risk chemicals.' WHERE question_id = 'aaf03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—limit only when evidence is strong.' WHERE question_id = 'aaf03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but prefer voluntary guidelines.' WHERE question_id = 'aaf03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'aaf03' AND value = 10 AND is_skip_option = false;

-- aaf04: Should federal nutrition assistance benefits be increased to address food insecurity?
UPDATE question_options SET text = 'Yes—because hunger prevention is a core federal role.' WHERE question_id = 'aaf04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most vulnerable households.' WHERE question_id = 'aaf04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest, targeted adjustments.' WHERE question_id = 'aaf04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current benefits.' WHERE question_id = 'aaf04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because benefits should be reduced.' WHERE question_id = 'aaf04' AND value = 10 AND is_skip_option = false;

-- aaf05: Should the U.S. prioritize domestic food production over imports?
UPDATE question_options SET text = 'Yes—because food security should be national.' WHERE question_id = 'aaf05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow imports where needed.' WHERE question_id = 'aaf05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance domestic and trade sources.' WHERE question_id = 'aaf05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but ensure fair trade rules.' WHERE question_id = 'aaf05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should decide sourcing.' WHERE question_id = 'aaf05' AND value = 10 AND is_skip_option = false;

-- aaf06: Should the government encourage more local and regional food supply chains?
UPDATE question_options SET text = 'Yes—because resilient local systems are essential.' WHERE question_id = 'aaf06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep incentives targeted.' WHERE question_id = 'aaf06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support only where cost-effective.' WHERE question_id = 'aaf06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited local grants.' WHERE question_id = 'aaf06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because supply chains should be private.' WHERE question_id = 'aaf06' AND value = 10 AND is_skip_option = false;

-- aaf07: Should genetically modified crops face stricter federal labeling requirements?
UPDATE question_options SET text = 'Yes—because consumers deserve full transparency.' WHERE question_id = 'aaf07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on clear, practical labels.' WHERE question_id = 'aaf07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—require labeling only where differences matter.' WHERE question_id = 'aaf07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow voluntary labeling.' WHERE question_id = 'aaf07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because special labels are unnecessary.' WHERE question_id = 'aaf07' AND value = 10 AND is_skip_option = false;

-- aaf08: Should federal grants prioritize regenerative agriculture research?
UPDATE question_options SET text = 'Yes—because regenerative research is essential.' WHERE question_id = 'aaf08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on proven methods.' WHERE question_id = 'aaf08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted research grants.' WHERE question_id = 'aaf08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited research funding.' WHERE question_id = 'aaf08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal grants should be reduced.' WHERE question_id = 'aaf08' AND value = 10 AND is_skip_option = false;

-- aaf09: Should the government increase oversight of meatpacking industry safety?
UPDATE question_options SET text = 'Yes—because worker and food safety need strict enforcement.' WHERE question_id = 'aaf09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk facilities.' WHERE question_id = 'aaf09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain current oversight with improvements.' WHERE question_id = 'aaf09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep essential inspections.' WHERE question_id = 'aaf09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because oversight is too burdensome.' WHERE question_id = 'aaf09' AND value = 10 AND is_skip_option = false;

-- aaf10: Should federal policy reduce food waste through national standards?
UPDATE question_options SET text = 'Yes—because waste reduction should be a national priority.' WHERE question_id = 'aaf10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but combine standards with incentives.' WHERE question_id = 'aaf10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—prefer voluntary programs with limited standards.' WHERE question_id = 'aaf10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage private initiatives.' WHERE question_id = 'aaf10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal standards are unnecessary.' WHERE question_id = 'aaf10' AND value = 10 AND is_skip_option = false;

-- =====================================================
-- ANIMALS (a01-a10)
-- =====================================================

-- a01: Should the federal government strengthen animal cruelty laws nationwide?
UPDATE question_options SET text = 'Yes—because strong national standards protect animals.' WHERE question_id = 'a01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow states some flexibility.' WHERE question_id = 'a01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate national standards.' WHERE question_id = 'a01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'a01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should decide.' WHERE question_id = 'a01' AND value = 10 AND is_skip_option = false;

-- a02: Should commercial breeding facilities face stricter federal regulations?
UPDATE question_options SET text = 'Yes—because animal welfare requires strong oversight.' WHERE question_id = 'a02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on problem facilities.' WHERE question_id = 'a02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate, targeted rules.' WHERE question_id = 'a02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain baseline standards.' WHERE question_id = 'a02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal regulation should be limited.' WHERE question_id = 'a02' AND value = 10 AND is_skip_option = false;

-- a03: Should animal testing be phased out where alternatives exist?
UPDATE question_options SET text = 'Yes—because alternatives should replace animal testing quickly.' WHERE question_id = 'a03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but phase out only when proven alternatives exist.' WHERE question_id = 'a03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited testing when necessary.' WHERE question_id = 'a03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage alternatives voluntarily.' WHERE question_id = 'a03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should not restrict research.' WHERE question_id = 'a03' AND value = 10 AND is_skip_option = false;

-- a04: Should the U.S. ban the trade of certain exotic animals as pets?
UPDATE question_options SET text = 'Yes—because exotic pet trade harms wildlife.' WHERE question_id = 'a04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk species.' WHERE question_id = 'a04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow trade with strict permits.' WHERE question_id = 'a04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited federal oversight.' WHERE question_id = 'a04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because trade should be unrestricted.' WHERE question_id = 'a04' AND value = 10 AND is_skip_option = false;

-- a05: Should federal law require larger space standards for farm animals?
UPDATE question_options SET text = 'Yes—because humane space should be mandated.' WHERE question_id = 'a05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased compliance.' WHERE question_id = 'a05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate standards with flexibility.' WHERE question_id = 'a05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current standards.' WHERE question_id = 'a05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal mandates are unnecessary.' WHERE question_id = 'a05' AND value = 10 AND is_skip_option = false;

-- a06: Should wildlife trafficking penalties be increased?
UPDATE question_options SET text = 'Yes—because trafficking requires strong deterrence.' WHERE question_id = 'a06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major offenders.' WHERE question_id = 'a06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest penalty increases.' WHERE question_id = 'a06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current penalties.' WHERE question_id = 'a06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because penalties are already sufficient.' WHERE question_id = 'a06' AND value = 10 AND is_skip_option = false;

-- a07: Should the government fund more wildlife conservation programs?
UPDATE question_options SET text = 'Yes—because conservation is a federal responsibility.' WHERE question_id = 'a07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target funds to critical habitats.' WHERE question_id = 'a07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited, targeted increases.' WHERE question_id = 'a07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'a07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because conservation should be private.' WHERE question_id = 'a07' AND value = 10 AND is_skip_option = false;

-- a08: Should marine mammal captivity be restricted by federal law?
UPDATE question_options SET text = 'Yes—because captivity harms animal welfare.' WHERE question_id = 'a08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited exceptions.' WHERE question_id = 'a08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit with strict welfare standards.' WHERE question_id = 'a08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain basic rules.' WHERE question_id = 'a08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal restrictions are unnecessary.' WHERE question_id = 'a08' AND value = 10 AND is_skip_option = false;

-- a09: Should federal agencies regulate the use of animals in entertainment?
UPDATE question_options SET text = 'Yes—because entertainment should not harm animals.' WHERE question_id = 'a09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk uses.' WHERE question_id = 'a09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate oversight.' WHERE question_id = 'a09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'a09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation is unnecessary.' WHERE question_id = 'a09' AND value = 10 AND is_skip_option = false;

-- a10: Should Congress restrict imports of animal products from countries with weak welfare standards?
UPDATE question_options SET text = 'Yes—because imports should meet U.S. standards.' WHERE question_id = 'a10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk products.' WHERE question_id = 'a10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow imports with disclosure requirements.' WHERE question_id = 'a10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary standards.' WHERE question_id = 'a10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because trade should be unrestricted.' WHERE question_id = 'a10' AND value = 10 AND is_skip_option = false;

-- =====================================================
-- ARMED FORCES AND NATIONAL SECURITY (afns01-afns10)
-- =====================================================

-- afns01: Should defense spending increase to address emerging global threats?
UPDATE question_options SET text = 'No—but shift funds to diplomacy and prevention.' WHERE question_id = 'afns01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain strong readiness with efficiency.' WHERE question_id = 'afns01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—adjust spending based on threats.' WHERE question_id = 'afns01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target key readiness gaps.' WHERE question_id = 'afns01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because major increases are needed.' WHERE question_id = 'afns01' AND value = 10 AND is_skip_option = false;

-- afns02: Should the U.S. reduce its overseas military footprint?
UPDATE question_options SET text = 'Yes—because overseas bases should be cut significantly.' WHERE question_id = 'afns02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep key strategic bases.' WHERE question_id = 'afns02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—reduce where appropriate, retain critical bases.' WHERE question_id = 'afns02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but streamline some deployments.' WHERE question_id = 'afns02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because presence deters threats.' WHERE question_id = 'afns02' AND value = 10 AND is_skip_option = false;

-- afns03: Should Congress require explicit authorization for most overseas deployments?
UPDATE question_options SET text = 'Yes—because Congress must authorize military action.' WHERE question_id = 'afns03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited emergency exceptions.' WHERE question_id = 'afns03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—require authorization for extended deployments.' WHERE question_id = 'afns03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve reporting to Congress.' WHERE question_id = 'afns03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because executive flexibility is needed.' WHERE question_id = 'afns03' AND value = 10 AND is_skip_option = false;

-- afns04: Should cyber defense be a top funding priority within the Pentagon?
UPDATE question_options SET text = 'Yes—because cyber threats are central.' WHERE question_id = 'afns04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with other defense needs.' WHERE question_id = 'afns04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate increases.' WHERE question_id = 'afns04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current levels.' WHERE question_id = 'afns04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because traditional defense should dominate.' WHERE question_id = 'afns04' AND value = 10 AND is_skip_option = false;

-- afns05: Should the U.S. invest more in missile defense systems?
UPDATE question_options SET text = 'No—but prioritize diplomacy and arms control.' WHERE question_id = 'afns05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited upgrades.' WHERE question_id = 'afns05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted improvements.' WHERE question_id = 'afns05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key threats.' WHERE question_id = 'afns05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because major expansion is needed.' WHERE question_id = 'afns05' AND value = 10 AND is_skip_option = false;

-- afns06: Should military aid to foreign allies be expanded?
UPDATE question_options SET text = 'No—but increase diplomatic support.' WHERE question_id = 'afns06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited aid for defense.' WHERE question_id = 'afns06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—provide aid selectively.' WHERE question_id = 'afns06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize key allies.' WHERE question_id = 'afns06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because expanded aid strengthens security.' WHERE question_id = 'afns06' AND value = 10 AND is_skip_option = false;

-- afns07: Should the draft registration system be revised or expanded?
UPDATE question_options SET text = 'No—because registration should be eliminated.' WHERE question_id = 'afns07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow voluntary service incentives.' WHERE question_id = 'afns07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain current registration.' WHERE question_id = 'afns07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but expand to all genders.' WHERE question_id = 'afns07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because broader registration is needed.' WHERE question_id = 'afns07' AND value = 10 AND is_skip_option = false;

-- afns08: Should veterans' healthcare funding be increased?
UPDATE question_options SET text = 'Yes—because veterans deserve expanded care.' WHERE question_id = 'afns08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target funding to gaps.' WHERE question_id = 'afns08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'afns08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve efficiency.' WHERE question_id = 'afns08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because private options should lead.' WHERE question_id = 'afns08' AND value = 10 AND is_skip_option = false;

-- afns09: Should the military prioritize climate resilience planning?
UPDATE question_options SET text = 'Yes—because climate risks threaten readiness.' WHERE question_id = 'afns09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but integrate with core missions.' WHERE question_id = 'afns09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—address climate risks where relevant.' WHERE question_id = 'afns09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited planning.' WHERE question_id = 'afns09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because it distracts from readiness.' WHERE question_id = 'afns09' AND value = 10 AND is_skip_option = false;

-- afns10: Should Congress limit the use of private military contractors?
UPDATE question_options SET text = 'Yes—because contractors should be sharply restricted.' WHERE question_id = 'afns10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited use with oversight.' WHERE question_id = 'afns10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit with strong oversight.' WHERE question_id = 'afns10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain transparency.' WHERE question_id = 'afns10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because contractors add flexibility.' WHERE question_id = 'afns10' AND value = 10 AND is_skip_option = false;

-- =====================================================
-- ARTS, CULTURE, RELIGION (acr01-acr10)
-- =====================================================

-- acr01: Should federal funding for the arts be increased?
UPDATE question_options SET text = 'Yes—because arts funding should expand nationally.' WHERE question_id = 'acr01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize underserved communities.' WHERE question_id = 'acr01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain or slightly increase funding.' WHERE question_id = 'acr01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited support.' WHERE question_id = 'acr01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal arts funding should end.' WHERE question_id = 'acr01' AND value = 10 AND is_skip_option = false;

-- acr02: Should public monuments be reviewed for historical context or bias?
UPDATE question_options SET text = 'Yes—because public history should be reevaluated.' WHERE question_id = 'acr02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but use community input for changes.' WHERE question_id = 'acr02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—review selectively when issues arise.' WHERE question_id = 'acr02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but preserve most monuments.' WHERE question_id = 'acr02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because monuments should not be changed.' WHERE question_id = 'acr02' AND value = 10 AND is_skip_option = false;

-- acr03: Should federal grants support cultural preservation programs?
UPDATE question_options SET text = 'Yes—because cultural preservation needs strong support.' WHERE question_id = 'acr03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk preservation.' WHERE question_id = 'acr03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited preservation grants.' WHERE question_id = 'acr03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private funding.' WHERE question_id = 'acr03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal grants are unnecessary.' WHERE question_id = 'acr03' AND value = 10 AND is_skip_option = false;

-- acr04: Should religious organizations receive the same public grant access as secular ones?
UPDATE question_options SET text = 'Yes—because access should be equal.' WHERE question_id = 'acr04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but require safeguards against discrimination.' WHERE question_id = 'acr04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit access for non-religious services.' WHERE question_id = 'acr04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited exceptions.' WHERE question_id = 'acr04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because church-state separation must apply.' WHERE question_id = 'acr04' AND value = 10 AND is_skip_option = false;

-- acr05: Should the government expand funding for museums and libraries?
UPDATE question_options SET text = 'Yes—because cultural access should expand.' WHERE question_id = 'acr05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on modernization.' WHERE question_id = 'acr05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest targeted funding.' WHERE question_id = 'acr05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep local funding priorities.' WHERE question_id = 'acr05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support should shrink.' WHERE question_id = 'acr05' AND value = 10 AND is_skip_option = false;

-- acr06: Should federal law protect cultural artifacts from commercial sale?
UPDATE question_options SET text = 'Yes—because heritage should be protected nationally.' WHERE question_id = 'acr06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on significant artifacts.' WHERE question_id = 'acr06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—protect only high-value heritage items.' WHERE question_id = 'acr06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow voluntary protections.' WHERE question_id = 'acr06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'acr06' AND value = 10 AND is_skip_option = false;

-- acr07: Should public schools allow more religious expression?
UPDATE question_options SET text = 'No—but allow private, non-endorsed expression.' WHERE question_id = 'acr07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but permit limited voluntary expression.' WHERE question_id = 'acr07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance free expression and neutrality.' WHERE question_id = 'acr07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but avoid official endorsement.' WHERE question_id = 'acr07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because schools should allow more expression.' WHERE question_id = 'acr07' AND value = 10 AND is_skip_option = false;

-- acr08: Should the government sponsor more community arts education programs?
UPDATE question_options SET text = 'Yes—because arts education should be widely supported.' WHERE question_id = 'acr08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on underserved schools.' WHERE question_id = 'acr08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted arts programs.' WHERE question_id = 'acr08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow local control.' WHERE question_id = 'acr08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be minimal.' WHERE question_id = 'acr08' AND value = 10 AND is_skip_option = false;

-- acr09: Should federal arts grants prioritize underserved communities?
UPDATE question_options SET text = 'Yes—because equity should guide funding.' WHERE question_id = 'acr09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain some broad access.' WHERE question_id = 'acr09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance equity and merit.' WHERE question_id = 'acr09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep grants open to all.' WHERE question_id = 'acr09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because targeted priorities are unfair.' WHERE question_id = 'acr09' AND value = 10 AND is_skip_option = false;

-- acr10: Should the U.S. increase protections for cultural heritage sites?
UPDATE question_options SET text = 'Yes—because heritage sites need strong safeguards.' WHERE question_id = 'acr10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize endangered sites.' WHERE question_id = 'acr10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited protections.' WHERE question_id = 'acr10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current protections.' WHERE question_id = 'acr10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal protections should be reduced.' WHERE question_id = 'acr10' AND value = 10 AND is_skip_option = false;

-- =====================================================
-- CIVIL RIGHTS AND LIBERTIES (crl01-crl10)
-- =====================================================

-- crl01: Should the federal government expand protections against discrimination?
UPDATE question_options SET text = 'Yes—because stronger protections are needed nationwide.' WHERE question_id = 'crl01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on clear gaps in law.' WHERE question_id = 'crl01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest updates where needed.' WHERE question_id = 'crl01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'crl01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should decide.' WHERE question_id = 'crl01' AND value = 10 AND is_skip_option = false;

-- crl02: Should hate crime penalties be increased at the federal level?
UPDATE question_options SET text = 'Yes—because stronger deterrence is needed.' WHERE question_id = 'crl02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target serious offenses only.' WHERE question_id = 'crl02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'crl02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but enforce current laws.' WHERE question_id = 'crl02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because penalties are already sufficient.' WHERE question_id = 'crl02' AND value = 10 AND is_skip_option = false;

-- crl03: Should federal agencies collect more data on racial disparities?
UPDATE question_options SET text = 'Yes—because data is necessary for accountability.' WHERE question_id = 'crl03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key agencies.' WHERE question_id = 'crl03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—collect targeted data only.' WHERE question_id = 'crl03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current reporting.' WHERE question_id = 'crl03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because data collection is intrusive.' WHERE question_id = 'crl03' AND value = 10 AND is_skip_option = false;

-- crl04: Should affirmative action be expanded or limited?
UPDATE question_options SET text = 'Yes—because affirmative action should expand.' WHERE question_id = 'crl04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but apply with safeguards.' WHERE question_id = 'crl04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited, targeted use.' WHERE question_id = 'crl04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep narrow exceptions.' WHERE question_id = 'crl04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because affirmative action should end.' WHERE question_id = 'crl04' AND value = 10 AND is_skip_option = false;

-- crl05: Should voting rights protections be strengthened nationwide?
UPDATE question_options SET text = 'Yes—because federal protections must expand.' WHERE question_id = 'crl05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep state flexibility.' WHERE question_id = 'crl05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted updates.' WHERE question_id = 'crl05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current standards.' WHERE question_id = 'crl05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should control elections.' WHERE question_id = 'crl05' AND value = 10 AND is_skip_option = false;

-- crl06: Should federal law restrict the use of facial recognition by police?
UPDATE question_options SET text = 'Yes—because it should be banned.' WHERE question_id = 'crl06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow narrow, high-risk exceptions.' WHERE question_id = 'crl06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit limited use with warrants.' WHERE question_id = 'crl06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require basic oversight.' WHERE question_id = 'crl06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because law enforcement needs tools.' WHERE question_id = 'crl06' AND value = 10 AND is_skip_option = false;

-- crl07: Should federal civil rights enforcement be expanded in housing and lending?
UPDATE question_options SET text = 'Yes—because enforcement should be stronger.' WHERE question_id = 'crl07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on clear discrimination cases.' WHERE question_id = 'crl07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted enforcement.' WHERE question_id = 'crl07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current oversight.' WHERE question_id = 'crl07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'crl07' AND value = 10 AND is_skip_option = false;

-- crl08: Should the government fund more legal aid for civil rights cases?
UPDATE question_options SET text = 'Yes—because access to justice should expand.' WHERE question_id = 'crl08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target low-income cases.' WHERE question_id = 'crl08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'crl08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'crl08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because legal aid should be private.' WHERE question_id = 'crl08' AND value = 10 AND is_skip_option = false;

-- crl09: Should protections for LGBTQ+ individuals be codified in federal law?
UPDATE question_options SET text = 'Yes—because comprehensive protections are needed.' WHERE question_id = 'crl09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on core civil rights areas.' WHERE question_id = 'crl09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted protections.' WHERE question_id = 'crl09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'crl09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should decide.' WHERE question_id = 'crl09' AND value = 10 AND is_skip_option = false;

-- crl10: Should Congress increase oversight of civil rights violations in prisons?
UPDATE question_options SET text = 'Yes—because federal oversight is essential.' WHERE question_id = 'crl10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on severe violations.' WHERE question_id = 'crl10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited oversight increases.' WHERE question_id = 'crl10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current standards.' WHERE question_id = 'crl10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because prisons should be state-led.' WHERE question_id = 'crl10' AND value = 10 AND is_skip_option = false;

-- =====================================================
-- COMMERCE (c01-c10)
-- =====================================================

-- c01: Should the federal government increase regulation of large corporations?
UPDATE question_options SET text = 'Yes—because stronger oversight is needed.' WHERE question_id = 'c01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the largest firms.' WHERE question_id = 'c01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—regulate where harms are clear.' WHERE question_id = 'c01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep basic protections.' WHERE question_id = 'c01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be reduced.' WHERE question_id = 'c01' AND value = 10 AND is_skip_option = false;

-- c02: Should antitrust enforcement be strengthened?
UPDATE question_options SET text = 'Yes—because monopolies must be broken up.' WHERE question_id = 'c02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major abuses.' WHERE question_id = 'c02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—enforce current rules with minor updates.' WHERE question_id = 'c02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current enforcement.' WHERE question_id = 'c02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because antitrust is too aggressive.' WHERE question_id = 'c02' AND value = 10 AND is_skip_option = false;

-- c03: Should federal law limit certain corporate mergers?
UPDATE question_options SET text = 'Yes—because competition should be protected.' WHERE question_id = 'c03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target market-dominant mergers.' WHERE question_id = 'c03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—review mergers case by case.' WHERE question_id = 'c03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current review process.' WHERE question_id = 'c03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mergers should be unrestricted.' WHERE question_id = 'c03' AND value = 10 AND is_skip_option = false;

-- c04: Should the government provide tax incentives for domestic manufacturing?
UPDATE question_options SET text = 'Yes—because reshoring should be a priority.' WHERE question_id = 'c04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic industries.' WHERE question_id = 'c04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—use incentives selectively.' WHERE question_id = 'c04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but consider limited credits.' WHERE question_id = 'c04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because government shouldn''t pick winners.' WHERE question_id = 'c04' AND value = 10 AND is_skip_option = false;

-- c05: Should e-commerce platforms face stricter consumer protection rules?
UPDATE question_options SET text = 'Yes—because online shoppers need stronger protections.' WHERE question_id = 'c05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target clear consumer harms.' WHERE question_id = 'c05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate updates.' WHERE question_id = 'c05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep existing rules.' WHERE question_id = 'c05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'c05' AND value = 10 AND is_skip_option = false;

-- c06: Should federal law restrict corporate data collection practices?
UPDATE question_options SET text = 'Yes—because privacy should be strongly protected.' WHERE question_id = 'c06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow opt-in use with safeguards.' WHERE question_id = 'c06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance privacy and innovation.' WHERE question_id = 'c06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require transparency.' WHERE question_id = 'c06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should self-regulate.' WHERE question_id = 'c06' AND value = 10 AND is_skip_option = false;

-- c07: Should small business grants be expanded?
UPDATE question_options SET text = 'Yes—because small businesses need strong support.' WHERE question_id = 'c07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved entrepreneurs.' WHERE question_id = 'c07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'c07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'c07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'c07' AND value = 10 AND is_skip_option = false;

-- c08: Should the government create new rules for gig-economy platforms?
UPDATE question_options SET text = 'Yes—because gig workers should be employees.' WHERE question_id = 'c08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but preserve some flexibility.' WHERE question_id = 'c08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance protections with flexibility.' WHERE question_id = 'c08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary benefits.' WHERE question_id = 'c08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'c08' AND value = 10 AND is_skip_option = false;

-- c09: Should federal policy limit price gouging during emergencies?
UPDATE question_options SET text = 'Yes—because strong protections are needed.' WHERE question_id = 'c09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but limit to declared emergencies.' WHERE question_id = 'c09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted rules.' WHERE question_id = 'c09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but rely on state laws.' WHERE question_id = 'c09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should respond freely.' WHERE question_id = 'c09' AND value = 10 AND is_skip_option = false;

-- c10: Should Congress reduce regulatory burdens on small businesses?
UPDATE question_options SET text = 'No—but streamline without weakening protections.' WHERE question_id = 'c10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but simplify paperwork only.' WHERE question_id = 'c10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance compliance and safety.' WHERE question_id = 'c10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep core protections.' WHERE question_id = 'c10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because major deregulation is needed.' WHERE question_id = 'c10' AND value = 10 AND is_skip_option = false;

-- =====================================================
-- CONGRESS (cong01-cong10)
-- =====================================================

-- cong01: Should Congress limit the use of the filibuster?
UPDATE question_options SET text = 'Yes—because the filibuster should end.' WHERE question_id = 'cong01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep limited protections.' WHERE question_id = 'cong01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest reforms.' WHERE question_id = 'cong01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited changes.' WHERE question_id = 'cong01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because the filibuster should be strengthened.' WHERE question_id = 'cong01' AND value = 10 AND is_skip_option = false;

-- cong02: Should members of Congress be allowed to trade individual stocks?
UPDATE question_options SET text = 'No—because it should be fully banned.' WHERE question_id = 'cong02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow mutual funds only.' WHERE question_id = 'cong02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow with strict transparency rules.' WHERE question_id = 'cong02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain current ethics rules.' WHERE question_id = 'cong02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because no new restrictions are needed.' WHERE question_id = 'cong02' AND value = 10 AND is_skip_option = false;

-- cong03: Should congressional term limits be enacted?
UPDATE question_options SET text = 'Yes—because entrenched power should be limited.' WHERE question_id = 'cong03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow longer terms before limits.' WHERE question_id = 'cong03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—consider limited reforms only.' WHERE question_id = 'cong03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve accountability.' WHERE question_id = 'cong03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because voters should decide.' WHERE question_id = 'cong03' AND value = 10 AND is_skip_option = false;

-- cong04: Should Congress increase transparency of lobbying activities?
UPDATE question_options SET text = 'Yes—because full transparency is needed.' WHERE question_id = 'cong04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major lobbyists.' WHERE question_id = 'cong04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate disclosure updates.' WHERE question_id = 'cong04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current reporting.' WHERE question_id = 'cong04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because transparency rules are excessive.' WHERE question_id = 'cong04' AND value = 10 AND is_skip_option = false;

-- cong05: Should congressional staff receive higher pay to reduce turnover?
UPDATE question_options SET text = 'Yes—because staff stability is important.' WHERE question_id = 'cong05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target raises to key roles.' WHERE question_id = 'cong05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest adjustments.' WHERE question_id = 'cong05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve efficiency.' WHERE question_id = 'cong05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because costs should be reduced.' WHERE question_id = 'cong05' AND value = 10 AND is_skip_option = false;

-- cong06: Should Congress require bills to be publicly available before votes?
UPDATE question_options SET text = 'Yes—because public review should be required.' WHERE question_id = 'cong06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow emergency exceptions.' WHERE question_id = 'cong06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage transparency with flexibility.' WHERE question_id = 'cong06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current timelines.' WHERE question_id = 'cong06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because strict rules slow governance.' WHERE question_id = 'cong06' AND value = 10 AND is_skip_option = false;

-- cong07: Should earmarks be expanded or limited?
UPDATE question_options SET text = 'No—but allow limited transparent earmarks.' WHERE question_id = 'cong07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but use strict oversight.' WHERE question_id = 'cong07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited, transparent earmarks.' WHERE question_id = 'cong07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep oversight.' WHERE question_id = 'cong07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because local spending should expand.' WHERE question_id = 'cong07' AND value = 10 AND is_skip_option = false;

-- cong08: Should ethics rules for lawmakers be strengthened?
UPDATE question_options SET text = 'Yes—because stronger ethics enforcement is needed.' WHERE question_id = 'cong08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target clear conflicts of interest.' WHERE question_id = 'cong08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited reforms.' WHERE question_id = 'cong08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'cong08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because current ethics rules are sufficient.' WHERE question_id = 'cong08' AND value = 10 AND is_skip_option = false;

-- cong09: Should Congress make it easier to pass bipartisan legislation?
UPDATE question_options SET text = 'Yes—because rules should encourage collaboration.' WHERE question_id = 'cong09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep protections for minority rights.' WHERE question_id = 'cong09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support minor procedural tweaks.' WHERE question_id = 'cong09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'cong09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because procedures are fine.' WHERE question_id = 'cong09' AND value = 10 AND is_skip_option = false;

-- cong10: Should Congress reduce its reliance on continuing resolutions?
UPDATE question_options SET text = 'Yes—because regular budgets should be required.' WHERE question_id = 'cong10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited short-term CRs.' WHERE question_id = 'cong10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage regular budgets with flexibility.' WHERE question_id = 'cong10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep CRs as needed.' WHERE question_id = 'cong10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because CRs provide stability.' WHERE question_id = 'cong10' AND value = 10 AND is_skip_option = false;

-- =====================================================
-- CRIME AND LAW ENFORCEMENT (cle01-cle10)
-- =====================================================

-- cle01: Should federal funding for community policing be expanded?
UPDATE question_options SET text = 'Yes—because community policing improves trust.' WHERE question_id = 'cle01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target proven programs.' WHERE question_id = 'cle01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited grants.' WHERE question_id = 'cle01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'cle01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal funding should be reduced.' WHERE question_id = 'cle01' AND value = 10 AND is_skip_option = false;

-- cle02: Should mandatory minimum sentences be reduced?
UPDATE question_options SET text = 'Yes—because mandatory minimums are unjust.' WHERE question_id = 'cle02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent offenses.' WHERE question_id = 'cle02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted reforms.' WHERE question_id = 'cle02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current guidelines.' WHERE question_id = 'cle02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sentencing should be tougher.' WHERE question_id = 'cle02' AND value = 10 AND is_skip_option = false;

-- cle03: Should Congress restrict the use of no-knock warrants?
UPDATE question_options SET text = 'Yes—because they should be banned.' WHERE question_id = 'cle03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow rare exceptions.' WHERE question_id = 'cle03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit with strict oversight.' WHERE question_id = 'cle03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'cle03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because police need flexibility.' WHERE question_id = 'cle03' AND value = 10 AND is_skip_option = false;

-- cle04: Should police departments be required to use body cameras?
UPDATE question_options SET text = 'Yes—because accountability requires universal cameras.' WHERE question_id = 'cle04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but provide federal funding support.' WHERE question_id = 'cle04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage adoption without mandates.' WHERE question_id = 'cle04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow local decisions.' WHERE question_id = 'cle04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates are unnecessary.' WHERE question_id = 'cle04' AND value = 10 AND is_skip_option = false;

-- cle05: Should federal law expand alternatives to incarceration?
UPDATE question_options SET text = 'Yes—because rehabilitation should replace incarceration.' WHERE question_id = 'cle05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target low-level offenses.' WHERE question_id = 'cle05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited alternatives.' WHERE question_id = 'cle05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow some diversion programs.' WHERE question_id = 'cle05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because incarceration should remain primary.' WHERE question_id = 'cle05' AND value = 10 AND is_skip_option = false;

-- cle06: Should the government increase penalties for fentanyl trafficking?
UPDATE question_options SET text = 'No—but expand treatment and prevention.' WHERE question_id = 'cle06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but target major traffickers only.' WHERE question_id = 'cle06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance enforcement and treatment.' WHERE question_id = 'cle06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on large-scale dealers.' WHERE question_id = 'cle06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strong deterrence is needed.' WHERE question_id = 'cle06' AND value = 10 AND is_skip_option = false;

-- cle07: Should federal grants support de-escalation training?
UPDATE question_options SET text = 'Yes—because training reduces violence.' WHERE question_id = 'cle07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but require evidence-based programs.' WHERE question_id = 'cle07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited grants.' WHERE question_id = 'cle07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow local training.' WHERE question_id = 'cle07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal funding is unnecessary.' WHERE question_id = 'cle07' AND value = 10 AND is_skip_option = false;

-- cle08: Should Congress limit qualified immunity for police?
UPDATE question_options SET text = 'Yes—because qualified immunity should end.' WHERE question_id = 'cle08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but replace with clear standards.' WHERE question_id = 'cle08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest reforms.' WHERE question_id = 'cle08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve accountability in other ways.' WHERE question_id = 'cle08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because officers need legal protection.' WHERE question_id = 'cle08' AND value = 10 AND is_skip_option = false;

-- cle09: Should federal law expand expungement opportunities?
UPDATE question_options SET text = 'Yes—because records should be cleared broadly.' WHERE question_id = 'cle09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent offenses.' WHERE question_id = 'cle09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted expansions.' WHERE question_id = 'cle09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited expungement.' WHERE question_id = 'cle09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because records should remain.' WHERE question_id = 'cle09' AND value = 10 AND is_skip_option = false;

-- cle10: Should the U.S. invest more in crime prevention programs?
UPDATE question_options SET text = 'Yes—because prevention reduces long-term crime.' WHERE question_id = 'cle10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on proven programs.' WHERE question_id = 'cle10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited investment.' WHERE question_id = 'cle10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'cle10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because enforcement should be prioritized.' WHERE question_id = 'cle10' AND value = 10 AND is_skip_option = false;