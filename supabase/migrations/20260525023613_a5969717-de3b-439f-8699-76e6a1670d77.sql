
INSERT INTO public.question_options (id, question_id, text, value, display_order, is_skip_option) VALUES
-- civil-rights-q21: Universal background checks
('civil-rights-q21-opt-1','civil-rights-q21','Yes—close all loopholes including private and gun-show sales.',-10,1,false),
('civil-rights-q21-opt-2','civil-rights-q21','Yes—expand checks but keep some private-sale exemptions.',-5,2,false),
('civil-rights-q21-opt-3','civil-rights-q21','Neutral—support modest improvements to current system.',0,3,false),
('civil-rights-q21-opt-4','civil-rights-q21','No—but improve enforcement of existing laws.',5,4,false),
('civil-rights-q21-opt-5','civil-rights-q21','No—current background-check laws are sufficient or too strict.',10,5,false),
('civil-rights-q21-opt-skip','civil-rights-q21','Not important to me',0,6,true),

-- civil-rights-q22: Federal abortion protection
('civil-rights-q22-opt-1','civil-rights-q22','Yes—codify Roe-level protections in federal law.',-10,1,false),
('civil-rights-q22-opt-2','civil-rights-q22','Yes—protect access with reasonable limits (e.g., viability).',-5,2,false),
('civil-rights-q22-opt-3','civil-rights-q22','Neutral—leave to states with minimum federal standards.',0,3,false),
('civil-rights-q22-opt-4','civil-rights-q22','No—states should decide, with limited federal restrictions.',5,4,false),
('civil-rights-q22-opt-5','civil-rights-q22','No—federal law should restrict or ban abortion.',10,5,false),
('civil-rights-q22-opt-skip','civil-rights-q22','Not important to me',0,6,true),

-- government-q21: Overturn Citizens United
('government-q21-opt-1','government-q21','Yes—pass a constitutional amendment to overturn it.',-10,1,false),
('government-q21-opt-2','government-q21','Yes—pass statutory limits on super PAC spending and disclosure.',-5,2,false),
('government-q21-opt-3','government-q21','Neutral—support disclosure rules only.',0,3,false),
('government-q21-opt-4','government-q21','No—but tighten foreign-money rules.',5,4,false),
('government-q21-opt-5','government-q21','No—Citizens United correctly protects political speech.',10,5,false),
('government-q21-opt-skip','government-q21','Not important to me',0,6,true)
ON CONFLICT (id) DO NOTHING;
