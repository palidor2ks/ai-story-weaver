-- Insert real Congress members with bioguide IDs
INSERT INTO candidates (id, name, office, state, party, district, is_incumbent, coverage_tier, confidence) VALUES
  ('S001150', 'Adam Schiff', 'Senator', 'California', 'Democrat', NULL, true, 'tier_1', 'high'),
  ('P000197', 'Nancy Pelosi', 'Representative', 'California', 'Democrat', '11', true, 'tier_1', 'high'),
  ('C001098', 'Ted Cruz', 'Senator', 'Texas', 'Republican', NULL, true, 'tier_1', 'high'),
  ('S000033', 'Bernie Sanders', 'Senator', 'Vermont', 'Independent', NULL, true, 'tier_1', 'high'),
  ('O000172', 'Alexandria Ocasio-Cortez', 'Representative', 'New York', 'Democrat', '14', true, 'tier_1', 'high'),
  ('G000593', 'Matt Gaetz', 'Representative', 'Florida', 'Republican', '1', true, 'tier_1', 'high'),
  ('W000187', 'Maxine Waters', 'Representative', 'California', 'Democrat', '43', true, 'tier_1', 'high'),
  ('J000299', 'Mike Johnson', 'Representative', 'Louisiana', 'Republican', '4', true, 'tier_1', 'high'),
  ('M000312', 'Jim McGovern', 'Representative', 'Massachusetts', 'Democrat', '2', true, 'tier_1', 'high'),
  ('G000386', 'Chuck Grassley', 'Senator', 'Iowa', 'Republican', NULL, true, 'tier_1', 'high')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  office = EXCLUDED.office,
  state = EXCLUDED.state,
  party = EXCLUDED.party,
  district = EXCLUDED.district,
  is_incumbent = EXCLUDED.is_incumbent,
  coverage_tier = EXCLUDED.coverage_tier,
  confidence = EXCLUDED.confidence;