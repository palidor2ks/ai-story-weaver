-- Complete Answer Options Update for ALL 320 Questions
-- This migration updates ALL question_options to use the new standardized format

-- ============================================
-- DOCUMENT 1: New_Questions-4.docx Topics
-- ============================================

-- Agriculture and Food (aaf01-aaf10)
UPDATE question_options SET text = 'Yes—because rapid scaling of sustainable farming is urgent.' WHERE question_id = 'aaf01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize support for small and sustainable farms.' WHERE question_id = 'aaf01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted incentives without major expansion.' WHERE question_id = 'aaf01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited incentives where cost-effective.' WHERE question_id = 'aaf01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because subsidies should be minimized.' WHERE question_id = 'aaf01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because climate shocks require strong federal protection.' WHERE question_id = 'aaf02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus increases on small farms.' WHERE question_id = 'aaf02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest, targeted adjustments.' WHERE question_id = 'aaf02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current protections.' WHERE question_id = 'aaf02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because insurance should be private.' WHERE question_id = 'aaf02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public health should override industry use.' WHERE question_id = 'aaf03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but only for clearly high-risk chemicals.' WHERE question_id = 'aaf03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—limit only when evidence is strong.' WHERE question_id = 'aaf03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but prefer voluntary guidelines.' WHERE question_id = 'aaf03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'aaf03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because hunger prevention is a core federal role.' WHERE question_id = 'aaf04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most food-insecure areas.' WHERE question_id = 'aaf04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest, targeted increases.' WHERE question_id = 'aaf04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current benefits.' WHERE question_id = 'aaf04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because benefits should be reduced.' WHERE question_id = 'aaf04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because food security should be national.' WHERE question_id = 'aaf05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow imports where needed.' WHERE question_id = 'aaf05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance domestic and trade sources.' WHERE question_id = 'aaf05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but ensure fair trade rules.' WHERE question_id = 'aaf05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should decide sourcing.' WHERE question_id = 'aaf05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because resilient local systems are essential.' WHERE question_id = 'aaf06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep incentives targeted.' WHERE question_id = 'aaf06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support only where cost-effective.' WHERE question_id = 'aaf06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited local grants.' WHERE question_id = 'aaf06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because supply chains should be private.' WHERE question_id = 'aaf06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because consumers deserve full transparency.' WHERE question_id = 'aaf07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on clear, practical labels.' WHERE question_id = 'aaf07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—require labeling only where differences matter.' WHERE question_id = 'aaf07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow voluntary labeling.' WHERE question_id = 'aaf07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because special labels are unnecessary.' WHERE question_id = 'aaf07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because sustainable research is urgent.' WHERE question_id = 'aaf08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but fund proven methods.' WHERE question_id = 'aaf08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced research priorities.' WHERE question_id = 'aaf08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'aaf08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should not favor methods.' WHERE question_id = 'aaf08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because worker and food safety need strict enforcement.' WHERE question_id = 'aaf09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk facilities.' WHERE question_id = 'aaf09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain current oversight with improvements.' WHERE question_id = 'aaf09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep essential inspections.' WHERE question_id = 'aaf09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because oversight is too burdensome.' WHERE question_id = 'aaf09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because waste reduction should be a national priority.' WHERE question_id = 'aaf10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but combine standards with incentives.' WHERE question_id = 'aaf10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—prefer voluntary programs with limited standards.' WHERE question_id = 'aaf10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage private initiatives.' WHERE question_id = 'aaf10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal standards are unnecessary.' WHERE question_id = 'aaf10' AND value = 10 AND is_skip_option = false;

-- Animals (a01-a10)
UPDATE question_options SET text = 'Yes—because strong national standards protect animals.' WHERE question_id = 'a01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow states some flexibility.' WHERE question_id = 'a01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate national standards.' WHERE question_id = 'a01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain baseline protections.' WHERE question_id = 'a01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should decide.' WHERE question_id = 'a01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because animal welfare requires strong oversight.' WHERE question_id = 'a02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on problem facilities.' WHERE question_id = 'a02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate, targeted rules.' WHERE question_id = 'a02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain baseline standards.' WHERE question_id = 'a02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal regulation should be limited.' WHERE question_id = 'a02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because alternatives should replace animal testing quickly.' WHERE question_id = 'a03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but phase out only when proven alternatives exist.' WHERE question_id = 'a03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited testing when necessary.' WHERE question_id = 'a03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage alternatives voluntarily.' WHERE question_id = 'a03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should not restrict research.' WHERE question_id = 'a03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because exotic pet trade harms wildlife.' WHERE question_id = 'a04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk species.' WHERE question_id = 'a04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow trade with strict permits.' WHERE question_id = 'a04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited federal oversight.' WHERE question_id = 'a04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because trade should be unrestricted.' WHERE question_id = 'a04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because humane space should be mandated.' WHERE question_id = 'a05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased compliance.' WHERE question_id = 'a05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate standards with flexibility.' WHERE question_id = 'a05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary improvements.' WHERE question_id = 'a05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal mandates are unnecessary.' WHERE question_id = 'a05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because trafficking requires strong deterrence.' WHERE question_id = 'a06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major offenders.' WHERE question_id = 'a06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest penalty increases.' WHERE question_id = 'a06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current penalties.' WHERE question_id = 'a06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because penalties are already sufficient.' WHERE question_id = 'a06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because conservation is a federal responsibility.' WHERE question_id = 'a07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target funds to critical habitats.' WHERE question_id = 'a07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited, targeted increases.' WHERE question_id = 'a07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'a07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because conservation should be private.' WHERE question_id = 'a07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because captivity harms animal welfare.' WHERE question_id = 'a08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited exceptions.' WHERE question_id = 'a08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit with strict welfare standards.' WHERE question_id = 'a08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain basic rules.' WHERE question_id = 'a08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal restrictions are unnecessary.' WHERE question_id = 'a08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because entertainment should not harm animals.' WHERE question_id = 'a09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk uses.' WHERE question_id = 'a09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate oversight.' WHERE question_id = 'a09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited standards.' WHERE question_id = 'a09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal regulation is unnecessary.' WHERE question_id = 'a09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because endangered species need strong protections.' WHERE question_id = 'a10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but streamline for efficiency.' WHERE question_id = 'a10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced protections.' WHERE question_id = 'a10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain core protections.' WHERE question_id = 'a10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because ESA should be weakened.' WHERE question_id = 'a10' AND value = 10 AND is_skip_option = false;

-- Armed Forces and National Security (afns01-afns10)
UPDATE question_options SET text = 'No—but shift funds to diplomacy and prevention.' WHERE question_id = 'afns01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain strong readiness with efficiency.' WHERE question_id = 'afns01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—adjust spending based on threats.' WHERE question_id = 'afns01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target key readiness gaps.' WHERE question_id = 'afns01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because major increases are needed.' WHERE question_id = 'afns01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because overseas bases should be cut significantly.' WHERE question_id = 'afns02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep key strategic bases.' WHERE question_id = 'afns02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—reduce where appropriate, retain critical bases.' WHERE question_id = 'afns02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but streamline some deployments.' WHERE question_id = 'afns02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because presence deters threats.' WHERE question_id = 'afns02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because Congress must authorize force.' WHERE question_id = 'afns03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow emergency exceptions.' WHERE question_id = 'afns03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—require authorization for major actions.' WHERE question_id = 'afns03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current oversight.' WHERE question_id = 'afns03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because executive flexibility is needed.' WHERE question_id = 'afns03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because cyber threats are central.' WHERE question_id = 'afns04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with other defense needs.' WHERE question_id = 'afns04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate increases.' WHERE question_id = 'afns04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current levels.' WHERE question_id = 'afns04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because traditional defense should dominate.' WHERE question_id = 'afns04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize diplomacy and arms control.' WHERE question_id = 'afns05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited upgrades.' WHERE question_id = 'afns05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted improvements.' WHERE question_id = 'afns05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key threats.' WHERE question_id = 'afns05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because major expansion is needed.' WHERE question_id = 'afns05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but increase diplomatic support.' WHERE question_id = 'afns06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited aid for defense.' WHERE question_id = 'afns06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—provide aid selectively.' WHERE question_id = 'afns06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize key allies.' WHERE question_id = 'afns06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because expanded aid strengthens security.' WHERE question_id = 'afns06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because registration should be expanded.' WHERE question_id = 'afns07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but only to include all genders.' WHERE question_id = 'afns07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain current registration.' WHERE question_id = 'afns07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep registration as-is.' WHERE question_id = 'afns07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because registration should end.' WHERE question_id = 'afns07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because veterans deserve expanded care.' WHERE question_id = 'afns08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target funding to gaps.' WHERE question_id = 'afns08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'afns08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve efficiency.' WHERE question_id = 'afns08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because private options should lead.' WHERE question_id = 'afns08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because climate risks threaten readiness.' WHERE question_id = 'afns09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but integrate with core missions.' WHERE question_id = 'afns09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—address climate risks where relevant.' WHERE question_id = 'afns09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited planning.' WHERE question_id = 'afns09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because it distracts from readiness.' WHERE question_id = 'afns09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because contractors should be sharply restricted.' WHERE question_id = 'afns10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited use with oversight.' WHERE question_id = 'afns10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit with strong oversight.' WHERE question_id = 'afns10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain transparency.' WHERE question_id = 'afns10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because contractors add flexibility.' WHERE question_id = 'afns10' AND value = 10 AND is_skip_option = false;

-- Arts, Culture, Religion (acr01-acr10)
UPDATE question_options SET text = 'Yes—because arts funding should expand nationally.' WHERE question_id = 'acr01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize underserved communities.' WHERE question_id = 'acr01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain or slightly increase funding.' WHERE question_id = 'acr01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep limited support.' WHERE question_id = 'acr01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal arts funding should end.' WHERE question_id = 'acr01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public history should be reevaluated.' WHERE question_id = 'acr02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but use community input for changes.' WHERE question_id = 'acr02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—review selectively when issues arise.' WHERE question_id = 'acr02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but preserve most monuments.' WHERE question_id = 'acr02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because monuments should not be changed.' WHERE question_id = 'acr02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because cultural preservation needs strong support.' WHERE question_id = 'acr03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk preservation.' WHERE question_id = 'acr03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited preservation grants.' WHERE question_id = 'acr03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private funding.' WHERE question_id = 'acr03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal grants are unnecessary.' WHERE question_id = 'acr03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access should be equal.' WHERE question_id = 'acr04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but require safeguards against discrimination.' WHERE question_id = 'acr04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit access for non-religious services.' WHERE question_id = 'acr04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited access.' WHERE question_id = 'acr04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because church-state separation is paramount.' WHERE question_id = 'acr04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because cultural access should expand.' WHERE question_id = 'acr05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on modernization.' WHERE question_id = 'acr05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest targeted funding.' WHERE question_id = 'acr05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep local funding priorities.' WHERE question_id = 'acr05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal support should shrink.' WHERE question_id = 'acr05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because heritage should be protected nationally.' WHERE question_id = 'acr06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on significant artifacts.' WHERE question_id = 'acr06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—protect only high-value heritage items.' WHERE question_id = 'acr06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow voluntary protections.' WHERE question_id = 'acr06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'acr06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but allow private, non-endorsed expression.' WHERE question_id = 'acr07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but permit limited voluntary expression.' WHERE question_id = 'acr07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance free expression and neutrality.' WHERE question_id = 'acr07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but avoid official endorsement.' WHERE question_id = 'acr07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because schools should allow more expression.' WHERE question_id = 'acr07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because arts education should be widely supported.' WHERE question_id = 'acr08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on underserved schools.' WHERE question_id = 'acr08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted arts programs.' WHERE question_id = 'acr08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow local control.' WHERE question_id = 'acr08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be minimal.' WHERE question_id = 'acr08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because equity should guide funding.' WHERE question_id = 'acr09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain some broad access.' WHERE question_id = 'acr09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance equity and merit.' WHERE question_id = 'acr09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep grants open to all.' WHERE question_id = 'acr09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because targeted priorities are unfair.' WHERE question_id = 'acr09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because heritage sites need strong safeguards.' WHERE question_id = 'acr10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize endangered sites.' WHERE question_id = 'acr10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited protections.' WHERE question_id = 'acr10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current protections.' WHERE question_id = 'acr10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal protections should be reduced.' WHERE question_id = 'acr10' AND value = 10 AND is_skip_option = false;

-- Civil Rights and Liberties (crl01-crl10)
UPDATE question_options SET text = 'Yes—because stronger protections are needed nationwide.' WHERE question_id = 'crl01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on clear gaps in law.' WHERE question_id = 'crl01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest updates where needed.' WHERE question_id = 'crl01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'crl01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should decide.' WHERE question_id = 'crl01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because stronger deterrence is needed.' WHERE question_id = 'crl02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target serious offenses only.' WHERE question_id = 'crl02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'crl02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but enforce current laws.' WHERE question_id = 'crl02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because penalties are already sufficient.' WHERE question_id = 'crl02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because data is necessary for accountability.' WHERE question_id = 'crl03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on key agencies.' WHERE question_id = 'crl03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—collect targeted data only.' WHERE question_id = 'crl03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current reporting.' WHERE question_id = 'crl03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because data collection is intrusive.' WHERE question_id = 'crl03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because affirmative action should expand.' WHERE question_id = 'crl04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but apply with safeguards.' WHERE question_id = 'crl04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited, targeted use.' WHERE question_id = 'crl04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep narrow exceptions.' WHERE question_id = 'crl04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because affirmative action should end.' WHERE question_id = 'crl04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because federal protections must expand.' WHERE question_id = 'crl05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep state flexibility.' WHERE question_id = 'crl05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted updates.' WHERE question_id = 'crl05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current standards.' WHERE question_id = 'crl05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should control elections.' WHERE question_id = 'crl05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because it should be banned.' WHERE question_id = 'crl06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow narrow, high-risk exceptions.' WHERE question_id = 'crl06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit limited use with warrants.' WHERE question_id = 'crl06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require basic oversight.' WHERE question_id = 'crl06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because law enforcement needs tools.' WHERE question_id = 'crl06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because enforcement should be stronger.' WHERE question_id = 'crl07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on clear discrimination cases.' WHERE question_id = 'crl07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted enforcement.' WHERE question_id = 'crl07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current oversight.' WHERE question_id = 'crl07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'crl07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access to justice should expand.' WHERE question_id = 'crl08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target low-income cases.' WHERE question_id = 'crl08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'crl08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'crl08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because legal aid should be private.' WHERE question_id = 'crl08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because comprehensive protections are needed.' WHERE question_id = 'crl09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on core civil rights areas.' WHERE question_id = 'crl09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted protections.' WHERE question_id = 'crl09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'crl09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should decide.' WHERE question_id = 'crl09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because federal oversight is essential.' WHERE question_id = 'crl10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on severe violations.' WHERE question_id = 'crl10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited oversight increases.' WHERE question_id = 'crl10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current standards.' WHERE question_id = 'crl10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because prisons should be state-led.' WHERE question_id = 'crl10' AND value = 10 AND is_skip_option = false;

-- Commerce (c01-c10)
UPDATE question_options SET text = 'Yes—because stronger oversight is needed.' WHERE question_id = 'c01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the largest firms.' WHERE question_id = 'c01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—regulate where harms are clear.' WHERE question_id = 'c01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep basic protections.' WHERE question_id = 'c01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be reduced.' WHERE question_id = 'c01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because monopolies must be broken up.' WHERE question_id = 'c02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major abuses.' WHERE question_id = 'c02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—enforce current rules with minor updates.' WHERE question_id = 'c02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current enforcement.' WHERE question_id = 'c02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because antitrust is too aggressive.' WHERE question_id = 'c02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because competition should be protected.' WHERE question_id = 'c03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major mergers.' WHERE question_id = 'c03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—review mergers case-by-case.' WHERE question_id = 'c03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'c03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mergers should be allowed.' WHERE question_id = 'c03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because reshoring should be a priority.' WHERE question_id = 'c04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic industries.' WHERE question_id = 'c04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—use incentives selectively.' WHERE question_id = 'c04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but consider limited credits.' WHERE question_id = 'c04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because government shouldn''t pick winners.' WHERE question_id = 'c04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because online shoppers need stronger protections.' WHERE question_id = 'c05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target clear consumer harms.' WHERE question_id = 'c05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate updates.' WHERE question_id = 'c05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep existing rules.' WHERE question_id = 'c05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'c05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because privacy should be strongly protected.' WHERE question_id = 'c06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow opt-in use with safeguards.' WHERE question_id = 'c06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance privacy and innovation.' WHERE question_id = 'c06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require transparency.' WHERE question_id = 'c06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should self-regulate.' WHERE question_id = 'c06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because small businesses need support.' WHERE question_id = 'c07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved areas.' WHERE question_id = 'c07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted grants.' WHERE question_id = 'c07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current programs.' WHERE question_id = 'c07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'c07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because gig workers should be employees.' WHERE question_id = 'c08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but preserve some flexibility.' WHERE question_id = 'c08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance protections with flexibility.' WHERE question_id = 'c08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary benefits.' WHERE question_id = 'c08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be minimal.' WHERE question_id = 'c08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strong protections are needed.' WHERE question_id = 'c09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but limit to declared emergencies.' WHERE question_id = 'c09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted rules.' WHERE question_id = 'c09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but rely on state laws.' WHERE question_id = 'c09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because markets should respond freely.' WHERE question_id = 'c09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but streamline without weakening protections.' WHERE question_id = 'c10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but simplify paperwork only.' WHERE question_id = 'c10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance compliance and safety.' WHERE question_id = 'c10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep core protections.' WHERE question_id = 'c10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because major deregulation is needed.' WHERE question_id = 'c10' AND value = 10 AND is_skip_option = false;

-- Congress (cong01-cong10)
UPDATE question_options SET text = 'Yes—because the filibuster should end.' WHERE question_id = 'cong01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep limited protections.' WHERE question_id = 'cong01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest reforms.' WHERE question_id = 'cong01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited changes.' WHERE question_id = 'cong01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because the filibuster should be strengthened.' WHERE question_id = 'cong01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—because it should be fully banned.' WHERE question_id = 'cong02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow mutual funds only.' WHERE question_id = 'cong02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow with strict transparency rules.' WHERE question_id = 'cong02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but maintain current ethics rules.' WHERE question_id = 'cong02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because no new restrictions are needed.' WHERE question_id = 'cong02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because entrenched power should be limited.' WHERE question_id = 'cong03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow longer terms before limits.' WHERE question_id = 'cong03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—consider limited reforms only.' WHERE question_id = 'cong03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve accountability.' WHERE question_id = 'cong03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because voters should decide.' WHERE question_id = 'cong03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because full transparency is needed.' WHERE question_id = 'cong04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major lobbyists.' WHERE question_id = 'cong04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate disclosure updates.' WHERE question_id = 'cong04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current reporting.' WHERE question_id = 'cong04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because transparency rules are excessive.' WHERE question_id = 'cong04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because staff stability is important.' WHERE question_id = 'cong05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target raises to key roles.' WHERE question_id = 'cong05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest adjustments.' WHERE question_id = 'cong05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve efficiency.' WHERE question_id = 'cong05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because costs should be reduced.' WHERE question_id = 'cong05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public review should be required.' WHERE question_id = 'cong06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow emergency exceptions.' WHERE question_id = 'cong06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage transparency with flexibility.' WHERE question_id = 'cong06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current timelines.' WHERE question_id = 'cong06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because strict rules slow governance.' WHERE question_id = 'cong06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but allow limited transparent earmarks.' WHERE question_id = 'cong07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but use strict oversight.' WHERE question_id = 'cong07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow limited, transparent earmarks.' WHERE question_id = 'cong07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep oversight.' WHERE question_id = 'cong07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because local spending should expand.' WHERE question_id = 'cong07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because stronger ethics enforcement is needed.' WHERE question_id = 'cong08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target clear conflicts of interest.' WHERE question_id = 'cong08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited reforms.' WHERE question_id = 'cong08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'cong08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because current ethics rules are sufficient.' WHERE question_id = 'cong08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rules should encourage collaboration.' WHERE question_id = 'cong09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep protections for minority rights.' WHERE question_id = 'cong09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support minor procedural tweaks.' WHERE question_id = 'cong09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current rules.' WHERE question_id = 'cong09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because procedures are fine.' WHERE question_id = 'cong09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because regular budgets should be required.' WHERE question_id = 'cong10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited short-term CRs.' WHERE question_id = 'cong10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage regular budgets with flexibility.' WHERE question_id = 'cong10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep CRs as needed.' WHERE question_id = 'cong10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because CRs provide stability.' WHERE question_id = 'cong10' AND value = 10 AND is_skip_option = false;

-- Crime and Law Enforcement (cle01-cle10)
UPDATE question_options SET text = 'Yes—because community policing improves trust.' WHERE question_id = 'cle01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target proven programs.' WHERE question_id = 'cle01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited grants.' WHERE question_id = 'cle01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'cle01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal funding should be reduced.' WHERE question_id = 'cle01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because mandatory minimums are unjust.' WHERE question_id = 'cle02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent offenses.' WHERE question_id = 'cle02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted reforms.' WHERE question_id = 'cle02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current sentences.' WHERE question_id = 'cle02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because sentences should be tougher.' WHERE question_id = 'cle02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because they should be banned.' WHERE question_id = 'cle03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow rare exceptions.' WHERE question_id = 'cle03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—permit with strict oversight.' WHERE question_id = 'cle03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current rules.' WHERE question_id = 'cle03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because police need flexibility.' WHERE question_id = 'cle03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because accountability requires universal cameras.' WHERE question_id = 'cle04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but provide federal funding support.' WHERE question_id = 'cle04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage adoption without mandates.' WHERE question_id = 'cle04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow local decisions.' WHERE question_id = 'cle04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because mandates are unnecessary.' WHERE question_id = 'cle04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rehabilitation should replace incarceration.' WHERE question_id = 'cle05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target low-level offenses.' WHERE question_id = 'cle05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited alternatives.' WHERE question_id = 'cle05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow some diversion programs.' WHERE question_id = 'cle05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because incarceration should remain primary.' WHERE question_id = 'cle05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but expand treatment and prevention.' WHERE question_id = 'cle06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but target major traffickers only.' WHERE question_id = 'cle06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance penalties with treatment.' WHERE question_id = 'cle06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major offenders.' WHERE question_id = 'cle06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strong penalties are needed.' WHERE question_id = 'cle06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because training reduces violence.' WHERE question_id = 'cle07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but require evidence-based programs.' WHERE question_id = 'cle07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited grants.' WHERE question_id = 'cle07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow local training.' WHERE question_id = 'cle07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal funding is unnecessary.' WHERE question_id = 'cle07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because qualified immunity should end.' WHERE question_id = 'cle08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but replace with clear standards.' WHERE question_id = 'cle08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest reforms.' WHERE question_id = 'cle08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but improve accountability in other ways.' WHERE question_id = 'cle08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because officers need legal protection.' WHERE question_id = 'cle08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because records should be cleared broadly.' WHERE question_id = 'cle09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on nonviolent offenses.' WHERE question_id = 'cle09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted expansions.' WHERE question_id = 'cle09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited expungement.' WHERE question_id = 'cle09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because records should remain.' WHERE question_id = 'cle09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because prevention reduces long-term crime.' WHERE question_id = 'cle10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on proven programs.' WHERE question_id = 'cle10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited investments.' WHERE question_id = 'cle10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current programs.' WHERE question_id = 'cle10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'cle10' AND value = 10 AND is_skip_option = false;

-- Economics and Public Finance (epf01-epf10)
UPDATE question_options SET text = 'No—but prioritize social investment.' WHERE question_id = 'epf01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but balance debt with key programs.' WHERE question_id = 'epf01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—reduce debt gradually.' WHERE question_id = 'epf01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but avoid harming growth.' WHERE question_id = 'epf01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because debt reduction should be top priority.' WHERE question_id = 'epf01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because major investment is needed.' WHERE question_id = 'epf02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-impact projects.' WHERE question_id = 'epf02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted increases.' WHERE question_id = 'epf02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited spending.' WHERE question_id = 'epf02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be restrained.' WHERE question_id = 'epf02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but allow flexibility for social programs.' WHERE question_id = 'epf03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but add modest guardrails.' WHERE question_id = 'epf03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate rules.' WHERE question_id = 'epf03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow emergency exceptions.' WHERE question_id = 'epf03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strict rules are needed.' WHERE question_id = 'epf03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because automatic stabilizers are essential.' WHERE question_id = 'epf04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the most vulnerable.' WHERE question_id = 'epf04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited stabilizers.' WHERE question_id = 'epf04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow emergency measures.' WHERE question_id = 'epf04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be discretionary.' WHERE question_id = 'epf04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because long-term public investment is essential.' WHERE question_id = 'epf05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with short-term needs.' WHERE question_id = 'epf05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—maintain a balanced mix.' WHERE question_id = 'epf05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited investment.' WHERE question_id = 'epf05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'epf05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because rural investment is overdue.' WHERE question_id = 'epf06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-need regions.' WHERE question_id = 'epf06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'epf06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'epf06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be minimal.' WHERE question_id = 'epf06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because states need automatic support.' WHERE question_id = 'epf07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the hardest-hit states.' WHERE question_id = 'epf07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited aid.' WHERE question_id = 'epf07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited, temporary aid.' WHERE question_id = 'epf07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because states should self-fund.' WHERE question_id = 'epf07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but focus on equity over cost.' WHERE question_id = 'epf08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but use analysis with safeguards.' WHERE question_id = 'epf08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—expand analysis moderately.' WHERE question_id = 'epf08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but avoid excessive bureaucracy.' WHERE question_id = 'epf08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strong cost-benefit rules are needed.' WHERE question_id = 'epf08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize public investment.' WHERE question_id = 'epf09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but add limited safeguards.' WHERE question_id = 'epf09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced requirements.' WHERE question_id = 'epf09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow exceptions.' WHERE question_id = 'epf09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strict limits are necessary.' WHERE question_id = 'epf09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because public R&D drives growth.' WHERE question_id = 'epf10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target strategic technologies.' WHERE question_id = 'epf10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'epf10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current levels.' WHERE question_id = 'epf10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because private sector should lead.' WHERE question_id = 'epf10' AND value = 10 AND is_skip_option = false;

-- Education (e01-e10)
UPDATE question_options SET text = 'Yes—because major investment is needed.' WHERE question_id = 'e01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underfunded districts.' WHERE question_id = 'e01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'e01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'e01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should shrink.' WHERE question_id = 'e01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because broad forgiveness is needed.' WHERE question_id = 'e02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on borrowers in need.' WHERE question_id = 'e02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted forgiveness.' WHERE question_id = 'e02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited relief.' WHERE question_id = 'e02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because forgiveness is unfair.' WHERE question_id = 'e02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but strengthen traditional public schools.' WHERE question_id = 'e03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited charter support.' WHERE question_id = 'e03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support quality charters selectively.' WHERE question_id = 'e03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but ensure accountability.' WHERE question_id = 'e03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because charter expansion is needed.' WHERE question_id = 'e03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because universal early education is vital.' WHERE question_id = 'e04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize low-income families.' WHERE question_id = 'e04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'e04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current levels.' WHERE question_id = 'e04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal role should be limited.' WHERE question_id = 'e04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because testing should be reduced significantly.' WHERE question_id = 'e05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep limited accountability.' WHERE question_id = 'e05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allow flexible testing standards.' WHERE question_id = 'e05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current standards.' WHERE question_id = 'e05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because testing is essential.' WHERE question_id = 'e05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because privacy should be strongly protected.' WHERE question_id = 'e06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow educational flexibility.' WHERE question_id = 'e06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced protections.' WHERE question_id = 'e06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but require transparency.' WHERE question_id = 'e06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal mandates are unnecessary.' WHERE question_id = 'e06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access depends on strong grants.' WHERE question_id = 'e07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the neediest students.' WHERE question_id = 'e07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'e07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current grants.' WHERE question_id = 'e07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because grants should be reduced.' WHERE question_id = 'e07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because workforce training should expand.' WHERE question_id = 'e08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-demand fields.' WHERE question_id = 'e08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited growth.' WHERE question_id = 'e08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'e08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal funding should be reduced.' WHERE question_id = 'e08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but focus on support over punishment.' WHERE question_id = 'e09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep balanced accountability.' WHERE question_id = 'e09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate standards.' WHERE question_id = 'e09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on outcomes.' WHERE question_id = 'e09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because strong accountability is needed.' WHERE question_id = 'e09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because access should expand.' WHERE question_id = 'e10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target underserved communities.' WHERE question_id = 'e10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted programs.' WHERE question_id = 'e10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current access.' WHERE question_id = 'e10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'e10' AND value = 10 AND is_skip_option = false;

-- Emergency Management (em01-em10)
UPDATE question_options SET text = 'Yes—because disaster response needs major funding.' WHERE question_id = 'em01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target severe-risk regions.' WHERE question_id = 'em01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'em01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'em01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'em01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because resilience must be a top priority.' WHERE question_id = 'em02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with immediate relief.' WHERE question_id = 'em02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support selective resilience upgrades.' WHERE question_id = 'em02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow optional resilience investments.' WHERE question_id = 'em02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because aid should be unconditional.' WHERE question_id = 'em02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because warning systems save lives.' WHERE question_id = 'em03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but prioritize high-risk regions.' WHERE question_id = 'em03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted upgrades.' WHERE question_id = 'em03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current systems.' WHERE question_id = 'em03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because expansion is unnecessary.' WHERE question_id = 'em03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because states need strong federal support.' WHERE question_id = 'em04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on high-risk states.' WHERE question_id = 'em04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited assistance.' WHERE question_id = 'em04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current programs.' WHERE question_id = 'em04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because preparedness is a state role.' WHERE question_id = 'em04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because aid should be fast-tracked.' WHERE question_id = 'em05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep basic oversight.' WHERE question_id = 'em05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest process improvements.' WHERE question_id = 'em05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current review.' WHERE question_id = 'em05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because strict approvals prevent waste.' WHERE question_id = 'em05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because more families need help.' WHERE question_id = 'em06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on low-income families.' WHERE question_id = 'em06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'em06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current eligibility.' WHERE question_id = 'em06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because eligibility should be tightened.' WHERE question_id = 'em06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because prevention is essential.' WHERE question_id = 'em07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-risk regions.' WHERE question_id = 'em07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited increases.' WHERE question_id = 'em07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'em07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because prevention spending should shrink.' WHERE question_id = 'em07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because training improves resilience.' WHERE question_id = 'em08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on vulnerable areas.' WHERE question_id = 'em08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted programs.' WHERE question_id = 'em08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current funding.' WHERE question_id = 'em08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal training is unnecessary.' WHERE question_id = 'em08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because national standards save lives.' WHERE question_id = 'em09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased adoption.' WHERE question_id = 'em09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—encourage states without mandates.' WHERE question_id = 'em09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but support voluntary improvements.' WHERE question_id = 'em09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because building codes are local.' WHERE question_id = 'em09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because equity should guide recovery.' WHERE question_id = 'em10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with overall need.' WHERE question_id = 'em10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—allocate based on damage severity.' WHERE question_id = 'em10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow targeted assistance.' WHERE question_id = 'em10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because all should receive equal aid.' WHERE question_id = 'em10' AND value = 10 AND is_skip_option = false;

-- Energy (eng01-eng10)
UPDATE question_options SET text = 'Yes—because rapid clean-energy transition is urgent.' WHERE question_id = 'eng01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target scalable technologies.' WHERE question_id = 'eng01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited incentives.' WHERE question_id = 'eng01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep small, targeted subsidies.' WHERE question_id = 'eng01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because subsidies should end.' WHERE question_id = 'eng01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because fossil fuel expansion should stop.' WHERE question_id = 'eng02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow limited leases in low-impact areas.' WHERE question_id = 'eng02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—limit only in sensitive areas.' WHERE question_id = 'eng02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep basic environmental rules.' WHERE question_id = 'eng02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because drilling should expand.' WHERE question_id = 'eng02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize renewables instead.' WHERE question_id = 'eng03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow limited safer nuclear research.' WHERE question_id = 'eng03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support balanced investment.' WHERE question_id = 'eng03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on advanced reactors.' WHERE question_id = 'eng03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because nuclear expansion is needed.' WHERE question_id = 'eng03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because efficiency reduces emissions.' WHERE question_id = 'eng04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-impact upgrades.' WHERE question_id = 'eng04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate incentives.' WHERE question_id = 'eng04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'eng04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because incentives should be reduced.' WHERE question_id = 'eng04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strict limits are necessary.' WHERE question_id = 'eng05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow phased compliance.' WHERE question_id = 'eng05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate standards.' WHERE question_id = 'eng05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep basic standards.' WHERE question_id = 'eng05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because standards should be rolled back.' WHERE question_id = 'eng05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but reduce reliance on oil.' WHERE question_id = 'eng06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current reserves.' WHERE question_id = 'eng06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest expansion.' WHERE question_id = 'eng06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep expansion limited.' WHERE question_id = 'eng06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because energy security requires growth.' WHERE question_id = 'eng06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because battery R&D is critical.' WHERE question_id = 'eng07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on scalable breakthroughs.' WHERE question_id = 'eng07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited research funding.' WHERE question_id = 'eng07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but allow private sector leadership.' WHERE question_id = 'eng07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal R&D should shrink.' WHERE question_id = 'eng07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'No—but prioritize global clean-energy cooperation.' WHERE question_id = 'eng08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but balance independence with trade.' WHERE question_id = 'eng08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support flexible sourcing.' WHERE question_id = 'eng08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but avoid excessive protectionism.' WHERE question_id = 'eng08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—because independence should be top priority.' WHERE question_id = 'eng08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because EV adoption should accelerate.' WHERE question_id = 'eng09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target incentives to middle-income buyers.' WHERE question_id = 'eng09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited incentives.' WHERE question_id = 'eng09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep minimal incentives.' WHERE question_id = 'eng09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because incentives should end.' WHERE question_id = 'eng09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because methane cuts are urgent.' WHERE question_id = 'eng10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but allow flexible compliance.' WHERE question_id = 'eng10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support moderate standards.' WHERE question_id = 'eng10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep minimal limits.' WHERE question_id = 'eng10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because regulation should be reduced.' WHERE question_id = 'eng10' AND value = 10 AND is_skip_option = false;

-- Environmental Protection (ep01-ep10)
UPDATE question_options SET text = 'Yes—because stronger enforcement is needed.' WHERE question_id = 'ep01' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on major polluters.' WHERE question_id = 'ep01' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest improvements.' WHERE question_id = 'ep01' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but maintain current enforcement.' WHERE question_id = 'ep01' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because enforcement is too aggressive.' WHERE question_id = 'ep01' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because more land should be preserved.' WHERE question_id = 'ep02' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on ecologically critical areas.' WHERE question_id = 'ep02' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited new protections.' WHERE question_id = 'ep02' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current protections.' WHERE question_id = 'ep02' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because designations should be reduced.' WHERE question_id = 'ep02' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because penalties must deter harm.' WHERE question_id = 'ep03' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target serious violations.' WHERE question_id = 'ep03' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support modest increases.' WHERE question_id = 'ep03' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current penalties.' WHERE question_id = 'ep03' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because penalties are already strong.' WHERE question_id = 'ep03' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because microplastics threaten health.' WHERE question_id = 'ep04' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but start with strict monitoring.' WHERE question_id = 'ep04' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted standards.' WHERE question_id = 'ep04' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary guidelines.' WHERE question_id = 'ep04' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal regulation is unnecessary.' WHERE question_id = 'ep04' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because conservation needs major funding.' WHERE question_id = 'ep05' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target high-value habitats.' WHERE question_id = 'ep05' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'ep05' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ep05' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should be reduced.' WHERE question_id = 'ep05' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because strict reviews protect ecosystems.' WHERE question_id = 'ep06' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but keep timelines manageable.' WHERE question_id = 'ep06' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—balance protection and development.' WHERE question_id = 'ep06' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but streamline for faster approvals.' WHERE question_id = 'ep06' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because reviews should be reduced.' WHERE question_id = 'ep06' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because single-use plastics should be banned.' WHERE question_id = 'ep07' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the worst offenders.' WHERE question_id = 'ep07' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support targeted restrictions.' WHERE question_id = 'ep07' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but encourage voluntary reductions.' WHERE question_id = 'ep07' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because federal limits are unnecessary.' WHERE question_id = 'ep07' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because restoration should be a national priority.' WHERE question_id = 'ep08' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but focus on critical habitats.' WHERE question_id = 'ep08' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited investments.' WHERE question_id = 'ep08' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current programs.' WHERE question_id = 'ep08' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because spending should be reduced.' WHERE question_id = 'ep08' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because equity must be central.' WHERE question_id = 'ep09' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but balance with broader goals.' WHERE question_id = 'ep09' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—consider EJ alongside other factors.' WHERE question_id = 'ep09' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but apply neutral standards.' WHERE question_id = 'ep09' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because EJ focus is misguided.' WHERE question_id = 'ep09' AND value = 10 AND is_skip_option = false;

UPDATE question_options SET text = 'Yes—because adaptation needs major investment.' WHERE question_id = 'ep10' AND value = -10 AND is_skip_option = false;
UPDATE question_options SET text = 'Yes—but target the highest-risk areas.' WHERE question_id = 'ep10' AND value = -5 AND is_skip_option = false;
UPDATE question_options SET text = 'Neutral—support limited expansion.' WHERE question_id = 'ep10' AND value = 0 AND is_skip_option = false;
UPDATE question_options SET text = 'No—but keep current funding.' WHERE question_id = 'ep10' AND value = 5 AND is_skip_option = false;
UPDATE question_options SET text = 'No—because funding should not expand.' WHERE question_id = 'ep10' AND value = 10 AND is_skip_option = false;