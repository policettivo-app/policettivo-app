export default async function handler(req, res) {
  try {
    const response = await fetch('https://kazlnoikvwdqwvxtigej.supabase.co/rest/v1/professionals?select=id&limit=1', {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthemxub2lrdndkcXd2eHRpZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTM1MDEsImV4cCI6MjA5MzEyOTUwMX0.gCclWImW4SnIBcsNfFAW0KNtimEw6iiEiLnXbgC96mE',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthemxub2lrdndkcXd2eHRpZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTM1MDEsImV4cCI6MjA5MzEyOTUwMX0.gCclWImW4SnIBcsNfFAW0KNtimEw6iiEiLnXbgC96mE'
      }
    })
    res.status(200).json({ ok: true, status: response.status })
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
