import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError, api } from '../lib/api';
import { minorToMajorInput, parseMajorToMinor } from '../lib/money';
import type { AdminPlan } from '../lib/plans';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  featuresText: z.string().trim().min(1, 'Add at least one feature'),
  usageLimit: z.number().int().positive(),
  currency: z.enum(CURRENCIES),
  monthlyMajor: z.string().trim().min(1, 'Monthly price is required'),
  yearlyMajor: z.string().trim().min(1, 'Yearly price is required'),
});

type PlanResponse = { plan: AdminPlan };

function featuresFromText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function AdminPlanForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [usageLimit, setUsageLimit] = useState('1000');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('USD');
  const [monthlyMajor, setMonthlyMajor] = useState('');
  const [yearlyMajor, setYearlyMajor] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [original, setOriginal] = useState<AdminPlan | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const data = await api<PlanResponse>(`/admin/plans/${id}`);
        if (cancelled) {
          return;
        }
        const month = data.plan.prices.find((price) => price.interval === 'MONTH');
        const year = data.plan.prices.find((price) => price.interval === 'YEAR');
        setOriginal(data.plan);
        setName(data.plan.name);
        setDescription(data.plan.description);
        setFeaturesText(data.plan.features.join('\n'));
        setUsageLimit(String(data.plan.usageLimit));
        setCurrency(
          CURRENCIES.includes(data.plan.prices[0]?.currency as (typeof CURRENCIES)[number])
            ? (data.plan.prices[0].currency as (typeof CURRENCIES)[number])
            : 'USD',
        );
        setMonthlyMajor(month ? minorToMajorInput(month.amount) : '');
        setYearlyMajor(year ? minorToMajorInput(year.amount) : '');
        setIsActive(data.plan.isActive);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : 'Could not load plan',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    setSuccess(null);

    const usageParsed = Number(usageLimit);
    const parsed = formSchema.safeParse({
      name,
      description,
      featuresText,
      usageLimit: Number.isFinite(usageParsed) ? usageParsed : Number.NaN,
      currency,
      monthlyMajor,
      yearlyMajor,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !next[field]) {
          next[field] = issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }

    const monthlyAmount = parseMajorToMinor(parsed.data.monthlyMajor);
    const yearlyAmount = parseMajorToMinor(parsed.data.yearlyMajor);
    const nextErrors: Record<string, string> = {};
    if (monthlyAmount === null || monthlyAmount <= 0) {
      nextErrors.monthlyMajor = 'Enter a positive amount with up to 2 decimals';
    }
    if (yearlyAmount === null || yearlyAmount <= 0) {
      nextErrors.yearlyMajor = 'Enter a positive amount with up to 2 decimals';
    }
    const features = featuresFromText(parsed.data.featuresText);
    if (features.length === 0) {
      nextErrors.featuresText = 'Add at least one feature';
    }
    if (
      Object.keys(nextErrors).length > 0 ||
      monthlyAmount === null ||
      yearlyAmount === null
    ) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (!isEdit) {
        await api<PlanResponse>('/admin/plans', {
          method: 'POST',
          body: JSON.stringify({
            name: parsed.data.name,
            description: parsed.data.description,
            features,
            usageLimit: parsed.data.usageLimit,
            currency: parsed.data.currency,
            monthlyAmount,
            yearlyAmount,
          }),
        });
        navigate('/admin/plans', { replace: true });
        return;
      }

      const month = original?.prices.find((price) => price.interval === 'MONTH');
      const year = original?.prices.find((price) => price.interval === 'YEAR');
      const body: Record<string, unknown> = {
        name: parsed.data.name,
        description: parsed.data.description,
        features,
        usageLimit: parsed.data.usageLimit,
        isActive,
      };
      if (month?.currency !== parsed.data.currency || year?.currency !== parsed.data.currency) {
        body.currency = parsed.data.currency;
      }
      if (month && monthlyAmount !== month.amount) {
        body.monthlyAmount = monthlyAmount;
      }
      if (year && yearlyAmount !== year.amount) {
        body.yearlyAmount = yearlyAmount;
      }

      const data = await api<PlanResponse>(`/admin/plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setOriginal(data.plan);
      setSuccess('Plan saved.');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const next: Record<string, string> = {};
          for (const detail of err.details) {
            next[detail.field] = detail.message;
          }
          setFieldErrors(next);
        }
        setServerError(err.message);
      } else {
        setServerError('Could not save plan');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading plan…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <h1>{isEdit ? 'Edit plan' : 'Create plan'}</h1>
        <p className="error">{loadError}</p>
        <p>
          <Link to="/admin/plans">Back to plans</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>{isEdit ? 'Edit plan' : 'Create plan'}</h1>
      <p className="muted">
        Prices are stored in minor units. Changing a price creates a new version and
        leaves the old one for existing subscriptions.
      </p>
      <form className="form form-wide" onSubmit={(event) => void onSubmit(event)}>
        {serverError && <p className="error">{serverError}</p>}
        {success && <p className="success">{success}</p>}
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {fieldErrors.name && (
            <span className="field-error">{fieldErrors.name}</span>
          )}
        </label>
        <label>
          Description
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          {fieldErrors.description && (
            <span className="field-error">{fieldErrors.description}</span>
          )}
        </label>
        <label>
          Features (one per line)
          <textarea
            rows={5}
            value={featuresText}
            onChange={(event) => setFeaturesText(event.target.value)}
          />
          {fieldErrors.featuresText && (
            <span className="field-error">{fieldErrors.featuresText}</span>
          )}
        </label>
        <label>
          Usage limit (API calls / month)
          <input
            type="number"
            min={1}
            step={1}
            value={usageLimit}
            onChange={(event) => setUsageLimit(event.target.value)}
          />
          {fieldErrors.usageLimit && (
            <span className="field-error">{fieldErrors.usageLimit}</span>
          )}
        </label>
        <label>
          Currency
          <select
            value={currency}
            onChange={(event) =>
              setCurrency(event.target.value as (typeof CURRENCIES)[number])
            }
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Monthly price
          <input
            type="text"
            inputMode="decimal"
            value={monthlyMajor}
            onChange={(event) => setMonthlyMajor(event.target.value)}
          />
          {fieldErrors.monthlyMajor && (
            <span className="field-error">{fieldErrors.monthlyMajor}</span>
          )}
        </label>
        <label>
          Yearly price
          <input
            type="text"
            inputMode="decimal"
            value={yearlyMajor}
            onChange={(event) => setYearlyMajor(event.target.value)}
          />
          {fieldErrors.yearlyMajor && (
            <span className="field-error">{fieldErrors.yearlyMajor}</span>
          )}
        </label>
        {isEdit && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Active (visible in the public catalogue)
          </label>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save plan' : 'Create plan'}
        </button>
      </form>
      <p className="muted">
        <Link to="/admin/plans">Back to plans</Link>
      </p>
    </main>
  );
}
