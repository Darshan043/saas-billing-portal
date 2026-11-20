import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { minorToMajorInput, parseMajorToMinor } from '../lib/money';
import type { AdminPlan } from '../lib/plans';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  featuresText: z.string().trim().min(1, 'Add at least one feature'),
  usageLimit: z.number().int().positive('Usage limit must be a positive number'),
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
      setSuccess('Plan updated successfully.');
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
      <main className="page page-wide">
        <PageHeader title="Loading Plan…" description="Fetching plan configuration from database." />
        <Card>
          <Skeleton width="40%" height="2rem" />
          <Skeleton width="100%" height="4rem" style={{ margin: '1rem 0' }} />
          <Skeleton width="60%" height="2rem" />
        </Card>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page page-wide">
        <PageHeader title={isEdit ? 'Edit Plan' : 'Create Plan'} />
        <Card>
          <EmptyState
            icon="⚠️"
            title="Plan could not be loaded"
            description={loadError}
            action={
              <Link to="/admin/plans" style={{ textDecoration: 'none' }}>
                <Button>Back to Plans</Button>
              </Link>
            }
          />
        </Card>
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title={isEdit ? `Edit Plan: ${name || 'Plan'}` : 'Create New Plan'}
        description="Configure plan features, pricing intervals, API call limits, and catalogue visibility."
      />

      <form onSubmit={(event) => void onSubmit(event)} style={{ maxWidth: '48rem' }}>
        {serverError && (
          <div className="callout-banner callout-banner-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            <span>{serverError}</span>
          </div>
        )}
        {success && (
          <div className="callout-banner callout-banner-success" role="status" style={{ marginBottom: 'var(--space-4)' }}>
            <span>{success}</span>
          </div>
        )}

        {/* Section 1: Basic Plan Details */}
        <div className="form-section-card">
          <h2 className="form-section-title">1. Plan Information</h2>
          <p className="form-section-desc">
            Define how this plan appears in customer pricing tables and invoices.
          </p>

          <div className="form-field">
            <label className="form-field-label" htmlFor="plan-name">
              Plan Name
            </label>
            <input
              id="plan-name"
              className={`form-control ${fieldErrors.name ? 'error' : ''}`}
              type="text"
              placeholder="e.g. Pro, Growth, Enterprise"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {fieldErrors.name && (
              <span className="field-error">{fieldErrors.name}</span>
            )}
          </div>

          <div className="form-field">
            <label className="form-field-label" htmlFor="plan-description">
              Description
            </label>
            <textarea
              id="plan-description"
              className={`form-control ${fieldErrors.description ? 'error' : ''}`}
              rows={3}
              placeholder="Brief summary of who this plan is tailored for"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            {fieldErrors.description && (
              <span className="field-error">{fieldErrors.description}</span>
            )}
          </div>

          <div className="form-field">
            <label className="form-field-label" htmlFor="plan-features">
              Features (one per line)
            </label>
            <textarea
              id="plan-features"
              className={`form-control ${fieldErrors.featuresText ? 'error' : ''}`}
              rows={5}
              placeholder="Dedicated webhook support&#10;Unlimited team seats&#10;99.9% SLA"
              value={featuresText}
              onChange={(event) => setFeaturesText(event.target.value)}
            />
            <div className="form-field-helper">
              Each line is converted into a bullet point on the public pricing cards.
            </div>
            {fieldErrors.featuresText && (
              <span className="field-error">{fieldErrors.featuresText}</span>
            )}
          </div>
        </div>

        {/* Section 2: Pricing Configuration */}
        <div className="form-section-card">
          <h2 className="form-section-title">2. Pricing & Currency</h2>
          <p className="form-section-desc">
            Prices are saved in minor currency units. Updating prices on an existing plan generates a new version without modifying active subscriber amounts.
          </p>

          <div className="form-grid-3">
            <div className="form-field">
              <label className="form-field-label" htmlFor="plan-currency">
                Currency
              </label>
              <select
                id="plan-currency"
                className="form-control"
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
            </div>

            <div className="form-field">
              <label className="form-field-label" htmlFor="plan-monthly">
                Monthly Price ({currency})
              </label>
              <input
                id="plan-monthly"
                className={`form-control ${fieldErrors.monthlyMajor ? 'error' : ''}`}
                type="text"
                inputMode="decimal"
                placeholder="29.00"
                value={monthlyMajor}
                onChange={(event) => setMonthlyMajor(event.target.value)}
              />
              {fieldErrors.monthlyMajor && (
                <span className="field-error">{fieldErrors.monthlyMajor}</span>
              )}
            </div>

            <div className="form-field">
              <label className="form-field-label" htmlFor="plan-yearly">
                Yearly Price ({currency})
              </label>
              <input
                id="plan-yearly"
                className={`form-control ${fieldErrors.yearlyMajor ? 'error' : ''}`}
                type="text"
                inputMode="decimal"
                placeholder="290.00"
                value={yearlyMajor}
                onChange={(event) => setYearlyMajor(event.target.value)}
              />
              {fieldErrors.yearlyMajor && (
                <span className="field-error">{fieldErrors.yearlyMajor}</span>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Usage Quotas & Visibility */}
        <div className="form-section-card">
          <h2 className="form-section-title">3. Quota Limits & Catalogue Status</h2>
          <p className="form-section-desc">
            Set the monthly API call allowance and visibility in the public plan catalogue.
          </p>

          <div className="form-field">
            <label className="form-field-label" htmlFor="plan-usage">
              Monthly Usage Limit (API calls / month)
            </label>
            <input
              id="plan-usage"
              className={`form-control ${fieldErrors.usageLimit ? 'error' : ''}`}
              type="number"
              min={1}
              step={1}
              value={usageLimit}
              onChange={(event) => setUsageLimit(event.target.value)}
            />
            <div className="form-field-helper">
              Included requests before any rate limiting applies.
            </div>
            {fieldErrors.usageLimit && (
              <span className="field-error">{fieldErrors.usageLimit}</span>
            )}
          </div>

          {isEdit && (
            <div className="form-field" style={{ marginTop: 'var(--space-4)' }}>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                <span>Active (visible in public pricing catalogue for customer subscriptions)</span>
              </label>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
          <Button
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save Plan Changes' : 'Create Plan'}
          </Button>

          <Link to="/admin/plans" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </main>
  );
}
