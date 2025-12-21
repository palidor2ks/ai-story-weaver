-- Clean up mock/test candidates that don't have real images
DELETE FROM candidates WHERE id IN ('c1', 'c2', 'c3', 'c4', 'c5', 'c6');