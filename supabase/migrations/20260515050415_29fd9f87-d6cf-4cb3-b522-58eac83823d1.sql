-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  type text NOT NULL,
  farmer_id uuid,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- Trigger: create notification for enumerator on verify/reject
CREATE OR REPLACE FUNCTION public.notify_enumerator_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('verified', 'rejected')
     AND NEW.enrolled_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, organization_id, type, farmer_id, title, body)
    VALUES (
      NEW.enrolled_by,
      NEW.organization_id,
      CASE WHEN NEW.status = 'verified' THEN 'farmer_verified' ELSE 'farmer_rejected' END,
      NEW.id,
      CASE WHEN NEW.status = 'verified'
        THEN 'Farmer verified: ' || NEW.first_name || ' ' || NEW.last_name
        ELSE 'Farmer rejected: ' || NEW.first_name || ' ' || NEW.last_name
      END,
      CASE WHEN NEW.status = 'rejected' AND NEW.notes IS NOT NULL
        THEN 'Reason: ' || NEW.notes
        ELSE NULL
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER farmers_notify_enumerator
AFTER UPDATE OF status ON public.farmers
FOR EACH ROW
EXECUTE FUNCTION public.notify_enumerator_on_status_change();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;