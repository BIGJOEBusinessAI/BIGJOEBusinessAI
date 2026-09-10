// netlify/functions/login.js
//
// Handles POST /api/login (via the redirect in netlify.toml).
// Verifies credentials with Supabase Auth and returns { user: {...} }
// exactly like the existing app.js api() helper expects.

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let email, password;
  try {
    ({ email, password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please enter all required fields.' }) };
  }

  try {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (error) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid email or password.' }) };
    }

    // Look up the profile for name/business info. Adjust to match your schema.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return {
      statusCode: 200,
      body: JSON.stringify({
        user: {
          id: data.user.id,
          email: data.user.email,
          name: profile?.name || data.user.user_metadata?.name || ''
        },
        session: data.session
      })
    };
  } catch (err) {
    console.error('BIGJOE login error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Login failed. Please try again.' }) };
  }
};
