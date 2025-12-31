-- Add missing answer options for immigration questions imm1 and imm2

-- imm1: "Should the U.S. build a wall along the southern border?"
INSERT INTO question_options (id, question_id, text, value, display_order, is_skip_option) VALUES
  ('imm1-opt-far-left', 'imm1', 'No physical barriers; prioritize humanitarian policies and open borders', -10, 1, false),
  ('imm1-opt-left', 'imm1', 'No wall; focus on technology and humanitarian processing', -5, 2, false),
  ('imm1-opt-center', 'imm1', 'Balanced approach with targeted barriers and improved processing', 0, 3, false),
  ('imm1-opt-right', 'imm1', 'Support physical barriers with legal immigration pathways', 5, 4, false),
  ('imm1-opt-far-right', 'imm1', 'Build a complete wall; strict border enforcement is essential', 10, 5, false);

-- imm2: "Should undocumented immigrants have a path to citizenship?"
INSERT INTO question_options (id, question_id, text, value, display_order, is_skip_option) VALUES
  ('imm2-opt-far-left', 'imm2', 'Immediate citizenship for all undocumented immigrants with full rights', -10, 1, false),
  ('imm2-opt-left', 'imm2', 'Yes, create accessible pathway with reasonable requirements', -5, 2, false),
  ('imm2-opt-center', 'imm2', 'Conditional pathway requiring background checks and civic integration', 0, 3, false),
  ('imm2-opt-right', 'imm2', 'Limited pathway only for specific groups (DACA, military service)', 5, 4, false),
  ('imm2-opt-far-right', 'imm2', 'No amnesty; enforce existing laws and require legal entry', 10, 5, false);