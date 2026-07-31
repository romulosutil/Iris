-- Fatia A (#163): ligar requireEmailVerification passa a exigir email_verified
-- de TODA conta. As contas criadas por seed:clinic nunca verificaram nada e
-- seriam trancadas pelo próprio deploy que liga a flag. Backfill vai junto,
-- nunca como passo manual — o deploy é automático no push.
UPDATE app_user SET email_verified = true WHERE email_verified = false;
