UPDATE public.candidates
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/March_2026_Official_Vice_Presidential_Portrait_of_JD_Vance_%28head-and-shoulders_cropped%29.jpg/960px-March_2026_Official_Vice_Presidential_Portrait_of_JD_Vance_%28head-and-shoulders_cropped%29.jpg'
WHERE id = 'V000137';

UPDATE public.candidate_overrides
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/March_2026_Official_Vice_Presidential_Portrait_of_JD_Vance_%28head-and-shoulders_cropped%29.jpg/960px-March_2026_Official_Vice_Presidential_Portrait_of_JD_Vance_%28head-and-shoulders_cropped%29.jpg'
WHERE candidate_id = 'V000137';