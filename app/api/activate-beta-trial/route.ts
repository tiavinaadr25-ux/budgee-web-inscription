import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import {
  ApiRouteError,
  assertAuthenticatedUser,
  ensureAllowedOrigin,
  jsonResponse,
  optionsResponse,
  requireAuthenticatedUser,
} from '../_lib/security';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const admin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

async function ensureProfile(userId: string) {
  if (!admin) {
    throw new ApiRouteError('Supabase n’est pas configuré.', 500);
  }

  let profileCheck = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();

  if (!profileCheck.data) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    profileCheck = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  }

  if (!profileCheck.data) {
    const { data: userData, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      throw error;
    }

    const { error: insertError } = await admin.from('profiles').insert({
      id: userId,
      email: userData.user?.email ?? '',
    });

    if (insertError) {
      throw insertError;
    }
  }
}

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  if (!admin) {
    return jsonResponse(
      request,
      { error: 'Supabase n’est pas configuré.' },
      { status: 500 },
    );
  }

  try {
    ensureAllowedOrigin(request);
    const authenticatedUser = await requireAuthenticatedUser(request);
    const payload = await request.json();
    const userId = String(payload.userId ?? '').trim();

    if (!userId) {
      return jsonResponse(
        request,
        { error: 'ID utilisateur manquant.' },
        { status: 400 },
      );
    }

    assertAuthenticatedUser(authenticatedUser, userId);
    await ensureProfile(userId);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const { data: existingSubs, error: existingSubsError } = await admin
      .from('subscriptions')
      .select('id, trial_ends_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (existingSubsError) {
      throw existingSubsError;
    }

    if (existingSubs && existingSubs.length > 0) {
      return jsonResponse(request, {
        ok: true,
        message: 'Un essai existe déjà pour ce compte.',
        trialEndsAt: existingSubs[0].trial_ends_at,
      });
    }

    const { error: insertError } = await admin.from('subscriptions').insert({
      user_id: userId,
      status: 'trialing',
      trial_ends_at: trialEndsAt.toISOString(),
      provider: 'beta',
      price_amount: 1.99,
      currency: 'EUR',
    });

    if (insertError) {
      throw insertError;
    }

    return jsonResponse(request, { ok: true, trialEndsAt });
  } catch (error) {
    const status = error instanceof ApiRouteError ? error.status : 500;
    return jsonResponse(
      request,
      {
        error: error instanceof Error ? error.message : 'Activation impossible.',
      },
      { status },
    );
  }
}
