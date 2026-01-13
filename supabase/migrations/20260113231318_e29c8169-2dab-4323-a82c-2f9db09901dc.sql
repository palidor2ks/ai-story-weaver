-- Standardize all topic icons to use emojis
UPDATE topics SET icon = '⚖️' WHERE id = 'civil-rights';
UPDATE topics SET icon = '🛡️' WHERE id = 'defense';
UPDATE topics SET icon = '💼' WHERE id = 'economy';
UPDATE topics SET icon = '🎓' WHERE id = 'education';
UPDATE topics SET icon = '🌿' WHERE id = 'environment';
UPDATE topics SET icon = '🌐' WHERE id = 'foreign-affairs';
UPDATE topics SET icon = '🏛️' WHERE id = 'government';
UPDATE topics SET icon = '❤️' WHERE id = 'healthcare';
UPDATE topics SET icon = '👥' WHERE id = 'immigration';
UPDATE topics SET icon = '⚖️' WHERE id = 'judicial';
UPDATE topics SET icon = '🤝' WHERE id = 'social-programs';
UPDATE topics SET icon = '💻' WHERE id = 'technology';