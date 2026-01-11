-- Update existing bill IDs to include congress number
-- This prevents ID collisions when ingesting bills from multiple congresses
UPDATE bills
SET id = congress || '-' || id
WHERE id NOT LIKE '%-%';