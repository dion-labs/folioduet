import { Check, LoaderCircle, MessageCircle, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  MAX_FEEDBACK_MESSAGE_LENGTH,
  type FeedbackCategory,
  type FeedbackInput,
} from '../firebase/feedback';

const CATEGORY_OPTIONS: Array<{
  value: FeedbackCategory;
  label: string;
}> = [
  { value: 'getting_started', label: "I couldn't get started" },
  { value: 'voice_quality', label: "The voice wasn't right" },
  { value: 'reading_experience', label: 'Reading felt awkward' },
  { value: 'missing_feature', label: 'I needed something else' },
  { value: 'something_broke', label: 'Something broke' },
  { value: 'other', label: 'I have another idea' },
];

interface FeedbackDialogProps {
  open: boolean;
  context: Omit<FeedbackInput, 'category' | 'message'>;
  onSubmit: (input: FeedbackInput) => Promise<void>;
  onSubmitted?: (category: FeedbackCategory) => void;
  onClose: () => void;
}

export function FeedbackDialog({
  open,
  context,
  onSubmit,
  onSubmitted,
  onClose,
}: FeedbackDialogProps) {
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(null);
    setMessage('');
    setBusy(false);
    setError(null);
    setSubmitted(false);
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!category || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ category, message, ...context });
      setSubmitted(true);
      onSubmitted?.(category);
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : 'Feedback could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="pe-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="pe-dialog pe-feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
      >
        <div className="pe-dialog-header">
          <div>
            <span className="pe-eyebrow">Help shape FolioDuet</span>
            <h2 id="feedback-dialog-title">
              {submitted ? 'Thank you.' : 'What got in your way?'}
            </h2>
          </div>
          <button className="pe-icon-button" onClick={onClose} disabled={busy} aria-label="Close feedback">
            <X size={19} />
          </button>
        </div>

        {submitted ? (
          <div className="pe-feedback-success" role="status">
            <span aria-hidden="true"><Check size={22} /></span>
            <strong>Your feedback reached the FolioDuet team.</strong>
            <p>We read every note and use them to decide what to improve next.</p>
            <button type="button" className="pe-button pe-button-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="pe-feedback-lead">
              Pick the closest answer. A short note is optional, but it helps us understand the problem.
            </p>

            <div className="pe-feedback-categories" role="group" aria-label="Feedback category">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={category === option.value ? 'is-selected' : undefined}
                  aria-pressed={category === option.value}
                  onClick={() => setCategory(option.value)}
                  disabled={busy}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="pe-feedback-message">
              <span>Anything else? <small>Optional</small></span>
              <textarea
                value={message}
                maxLength={MAX_FEEDBACK_MESSAGE_LENGTH}
                rows={5}
                placeholder="Tell us what you expected, what happened, or what would make you come back."
                onChange={(event) => setMessage(event.target.value)}
                disabled={busy}
              />
              <small>{message.length} / {MAX_FEEDBACK_MESSAGE_LENGTH}</small>
            </label>

            {error ? <p className="pe-form-error" role="alert">{error}</p> : null}

            <div className="pe-feedback-actions">
              <p><MessageCircle size={14} /> No Google account required.</p>
              <button
                type="submit"
                className="pe-button pe-button-primary"
                disabled={!category || busy}
              >
                {busy ? <LoaderCircle className="pe-spin" size={17} /> : null}
                {busy ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
