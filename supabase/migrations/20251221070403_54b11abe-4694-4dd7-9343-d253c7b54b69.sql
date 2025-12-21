-- Add Gun Policy questions
INSERT INTO questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot) VALUES
('gun1', 'gun-policy', 'Should there be stricter background checks for gun purchases?', true, 1),
('gun2', 'gun-policy', 'Should assault-style weapons be banned for civilian ownership?', true, 2);

-- Add Civil Rights questions  
INSERT INTO questions (id, topic_id, text, is_onboarding_canonical, onboarding_slot) VALUES
('cr1', 'civil-rights', 'Should affirmative action be used in college admissions?', true, 1),
('cr2', 'civil-rights', 'Should there be federal protections against discrimination based on sexual orientation and gender identity?', true, 2);

-- Add question options for Gun Policy Q1
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('gun1-a', 'gun1', 'Strongly support stricter checks', 10, 1),
('gun1-b', 'gun1', 'Somewhat support stricter checks', 5, 2),
('gun1-c', 'gun1', 'Current checks are sufficient', 0, 3),
('gun1-d', 'gun1', 'Somewhat oppose stricter checks', -5, 4),
('gun1-e', 'gun1', 'Strongly oppose any additional checks', -10, 5);

-- Add question options for Gun Policy Q2
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('gun2-a', 'gun2', 'Strongly support a ban', 10, 1),
('gun2-b', 'gun2', 'Somewhat support a ban', 5, 2),
('gun2-c', 'gun2', 'Undecided', 0, 3),
('gun2-d', 'gun2', 'Somewhat oppose a ban', -5, 4),
('gun2-e', 'gun2', 'Strongly oppose any ban', -10, 5);

-- Add question options for Civil Rights Q1
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cr1-a', 'cr1', 'Strongly support affirmative action', 10, 1),
('cr1-b', 'cr1', 'Somewhat support it', 5, 2),
('cr1-c', 'cr1', 'Neutral/Undecided', 0, 3),
('cr1-d', 'cr1', 'Somewhat oppose it', -5, 4),
('cr1-e', 'cr1', 'Strongly oppose affirmative action', -10, 5);

-- Add question options for Civil Rights Q2
INSERT INTO question_options (id, question_id, text, value, display_order) VALUES
('cr2-a', 'cr2', 'Strongly support federal protections', 10, 1),
('cr2-b', 'cr2', 'Somewhat support protections', 5, 2),
('cr2-c', 'cr2', 'Neutral/Undecided', 0, 3),
('cr2-d', 'cr2', 'Somewhat oppose federal protections', -5, 4),
('cr2-e', 'cr2', 'Strongly oppose federal protections', -10, 5);