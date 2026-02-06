-- Contact Form Submissions Table
-- Simple database storage for contact form - no email setup required

CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  account_email TEXT,
  username TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT FALSE
);

-- Index for viewing submissions
CREATE INDEX IF NOT EXISTS idx_contact_submissions_submitted 
  ON contact_submissions(submitted_at DESC);

-- RLS - Only you can read (service role)
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Admin can read all
CREATE POLICY "Service role can read all contact submissions"
  ON contact_submissions FOR SELECT
  TO service_role
  USING (true);

-- Anyone can insert (public contact form)
CREATE POLICY "Anyone can submit contact form"
  ON contact_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
