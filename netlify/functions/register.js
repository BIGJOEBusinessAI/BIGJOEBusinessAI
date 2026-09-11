// netlify/functions/register.js
//
// Handles POST /api/register (via the redirect in netlify.toml).
// Creates a Supabase Auth user, a matching profiles row, and signs them in
// immediately so the frontend gets back { user: {...} } exactly like the
// existing app.js api() helper expects.

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

  let name, email, password;
  try {
    ({ name, email, password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!email || !password || !name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please enter all required fields.' }) };
  }

  try {
    // Create the user with email pre-confirmed so they can log in right away.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (createError) {
      const message = /already registered|already exists/i.test(createError.message)
        ? 'An account with this email already exists.'
        : createError.message;
      return { statusCode: 400, body: JSON.stringify({ error: message }) };
    }

    const userId = created.user.id;

    // Create a matching profile row. Adjust table/column names to match
    // whatever you actually set up in Supabase.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, name, email });

    if (profileError) {
      // Don't fail the whole registration just because the profile insert
      // failed — the auth account itself was created successfully.
      console.error('BIGJOE profile insert error:', profileError.message);
    }

    // Sign in immediately so the response includes a usable session.
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      return { statusCode: 400, body: JSON.stringify({ error: signInError.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        user: { id: userId, name, email },
        session: signInData.session
      })
    };
  } catch (err) {
    console.error('BIGJOE register error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Registration failed. Please try again.' }) };
  }
};
