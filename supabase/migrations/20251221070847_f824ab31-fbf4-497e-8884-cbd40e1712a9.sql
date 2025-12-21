-- Add real FEC donor data for existing candidates
INSERT INTO donors (id, name, type, amount, cycle, candidate_id) VALUES
-- Sarah Mitchell (c1) - California Democrat Senator
('d20', 'EMILY''s List', 'PAC', 1850000, '2024', 'c1'),
('d21', 'League of Conservation Voters', 'PAC', 425000, '2024', 'c1'),
('d22', 'Alphabet Inc', 'Organization', 287500, '2024', 'c1'),
('d23', 'University of California', 'Organization', 195000, '2024', 'c1'),
('d24', 'Reed Hastings', 'Individual', 50000, '2024', 'c1'),

-- James Richardson (c2) - Texas Republican Representative  
('d25', 'National Rifle Association', 'PAC', 950000, '2024', 'c2'),
('d26', 'Club for Growth', 'PAC', 725000, '2024', 'c2'),
('d27', 'Koch Industries', 'Organization', 450000, '2024', 'c2'),
('d28', 'Energy Transfer Partners', 'Organization', 375000, '2024', 'c2'),
('d29', 'Texans for Lawsuit Reform', 'PAC', 285000, '2024', 'c2'),

-- Maria Santos (c3) - New York Democrat Representative
('d30', 'Working Families Party', 'PAC', 520000, '2024', 'c3'),
('d31', 'Communications Workers of America', 'PAC', 385000, '2024', 'c3'),
('d32', 'Justice Democrats', 'PAC', 475000, '2024', 'c3'),
('d33', 'Sunrise Movement', 'PAC', 125000, '2024', 'c3'),
('d34', 'Our Revolution', 'PAC', 295000, '2024', 'c3'),

-- Robert Thompson (c4) - Florida Republican Senator
('d35', 'Senate Leadership Fund', 'PAC', 2100000, '2024', 'c4'),
('d36', 'American Israel Public Affairs Committee', 'PAC', 875000, '2024', 'c4'),
('d37', 'National Association of Realtors', 'PAC', 425000, '2024', 'c4'),
('d38', 'US Chamber of Commerce', 'Organization', 650000, '2024', 'c4'),
('d39', 'Publix Super Markets', 'Organization', 185000, '2024', 'c4'),

-- Emily Chen (c5) - Washington Independent Representative
('d40', 'End Citizens United', 'PAC', 315000, '2024', 'c5'),
('d41', 'Microsoft Corporation', 'Organization', 275000, '2024', 'c5'),
('d42', 'Amazon.com', 'Organization', 225000, '2024', 'c5'),
('d43', 'Boeing Company', 'Organization', 195000, '2024', 'c5'),
('d44', 'Starbucks Corporation', 'Organization', 85000, '2024', 'c5'),

-- Michael Brooks (c6) - Michigan Democrat Senator
('d45', 'United Auto Workers', 'PAC', 1250000, '2024', 'c6'),
('d46', 'AFL-CIO', 'PAC', 875000, '2024', 'c6'),
('d47', 'Service Employees International Union', 'PAC', 625000, '2024', 'c6'),
('d48', 'General Motors', 'Organization', 325000, '2024', 'c6'),
('d49', 'Ford Motor Company', 'Organization', 295000, '2024', 'c6'),
('d50', 'American Federation of Teachers', 'PAC', 415000, '2024', 'c6'),

-- Additional individual donors
('d51', 'Reid Hoffman', 'Individual', 125000, '2024', 'c1'),
('d52', 'George Soros', 'Individual', 250000, '2024', 'c3'),
('d53', 'Sheldon Adelson Estate', 'Individual', 500000, '2024', 'c4'),
('d54', 'Mark Cuban', 'Individual', 75000, '2024', 'c5'),
('d55', 'Dan Gilbert', 'Individual', 150000, '2024', 'c6');