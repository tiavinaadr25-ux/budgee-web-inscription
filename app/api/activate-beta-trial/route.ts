import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  if (!admin) {
    return NextResponse.json(
      { error: 'Supabase n’est pas configuré.' },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const payload = await request.json();
    const userId = String(payload.userId ?? '').trim();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'ID utilisateur manquant.' },
        { status: 400, headers: corsHeaders }
      );
    }

    // S'assurer que le profil existe (parfois le trigger Supabase met quelques millisecondes)
    let profileCheck = await admin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!profileCheck.data) {
      // On attend un tout petit peu
      await new Promise(resolve => setTimeout(resolve, 500));
      profileCheck = await admin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
    }

    if (!profileCheck.data) {
      // Si toujours rien, on le crée manuellement pour éviter l'erreur de clé étrangère
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      await admin.from('profiles').insert({
        id: userId,
        email: userData.user?.email ?? '',
      });
    }

    // Calcul de la date de fin (7 jours à partir de maintenant)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    // Création de l'abonnement "Beta" dans la base
    // On essaie d'abord d'insérer, si ça échoue on pourra logger plus précisément
    const { data: existingSub } = await admin
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    let dbResult;

    if (existingSub) {
      dbResult = await admin
        .from('subscriptions')
        .update({
          status: 'trialing',
          trial_ends_at: trialEndsAt.toISOString(),
          provider: 'beta'
        })
        .eq('id', existingSub.id);
    } else {
      dbResult = await admin
        .from('subscriptions')
        .insert({
          user_id: userId,
          status: 'trialing',
          trial_ends_at: trialEndsAt.toISOString(),
          provider: 'beta',
          price_amount: 3.49,
          currency: 'EUR'
        });
    }

    if (dbResult.error) {
      console.error('Database Error:', dbResult.error);
      return NextResponse.json(
        { error: `Erreur base de données : ${dbResult.error.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ ok: true, trialEndsAt }, { headers: corsHeaders });
  } catch (error) {
    console.error('Beta Trial Activation Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Activation impossible.',
        details: error
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
