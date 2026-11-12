"use client";

import { useState, useTransition, useRef } from "react";
import type { FullProfile } from "@/lib/profile/data";
import { updateProfileAction, changePasswordAction } from "@/lib/profile/actions";
import { Avatar } from "@/components/ui/avatar";
import {
  AlertIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  LockIcon,
  ShieldIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { ROLE_LABEL } from "@/lib/navigation";
import { cn } from "@/lib/cn";

export interface ProfileEditorProps {
  initialProfile: FullProfile;
  demoSession?: boolean;
}

const COMMON_TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "America/New York (Eastern Time - US)" },
  { value: "America/Chicago", label: "America/Chicago (Central Time - US)" },
  { value: "America/Denver", label: "America/Denver (Mountain Time - US)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (Pacific Time - US)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST - UAE)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST - India)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
];

const COMMON_LANGUAGES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "es-ES", label: "Español (Spanish)" },
  { value: "fr-FR", label: "Français (French)" },
  { value: "de-DE", label: "Deutsch (German)" },
  { value: "ja-JP", label: "日本語 (Japanese)" },
  { value: "ar-AE", label: "العربية (Arabic)" },
  { value: "hi-IN", label: "हिन्दी (Hindi)" },
];

export function ProfileEditor({ initialProfile, demoSession }: ProfileEditorProps) {
  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form state
  const [isProfilePending, startProfileTransition] = useTransition();
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [bioCharCount, setBioCharCount] = useState(initialProfile.bio.length);

  // Password state
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordFormRef = useRef<HTMLFormElement>(null);

  // Avatar file upload handler
  async function handleAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setAvatarSuccess(null);

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Avatar image must be smaller than 2 MB.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setAvatarError("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAvatarError(data.error || "Failed to upload avatar image.");
      } else {
        setAvatarUrl(data.avatarUrl);
        setAvatarSuccess("Avatar updated successfully.");
      }
    } catch {
      setAvatarError("Network error while uploading avatar image.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Avatar removal handler
  async function handleAvatarRemove() {
    setAvatarError(null);
    setAvatarSuccess(null);
    setUploadingAvatar(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAvatarError(data.error || "Failed to remove avatar.");
      } else {
        setAvatarUrl(null);
        setAvatarSuccess("Avatar removed.");
      }
    } catch {
      setAvatarError("Network error while removing avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Profile details submission
  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileSuccess(null);
    setProfileError(null);

    const formData = new FormData(e.currentTarget);
    startProfileTransition(async () => {
      const res = await updateProfileAction(undefined, formData);
      if (!res.ok) {
        setProfileError(res.error || "Failed to save profile changes.");
      } else {
        setProfileSuccess(res.message || "Profile updated successfully.");
      }
    });
  }

  // Password submission
  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordSuccess(null);
    setPasswordError(null);

    const formData = new FormData(e.currentTarget);
    startPasswordTransition(async () => {
      const res = await changePasswordAction(undefined, formData);
      if (!res.ok) {
        setPasswordError(res.error || "Failed to update password.");
      } else {
        setPasswordSuccess(res.message || "Password updated successfully.");
        passwordFormRef.current?.reset();
      }
    });
  }

  const memberSince = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(initialProfile.createdAt));

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-16">
      {/* 1. Header Hero Card with Avatar */}
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-2xs transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar with live preview & hover actions */}
          <div className="relative group shrink-0">
            <Avatar
              name={initialProfile.name}
              src={avatarUrl}
              size="2xl"
              className="size-24 ring-2 ring-line"
            />
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/60 text-surface text-micro font-medium">
                Saving...
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-ink truncate">
                {initialProfile.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300 dark:border dark:border-brand-800">
                <ShieldIcon className="size-3" />
                {ROLE_LABEL[initialProfile.role]} Workspace
              </span>
            </div>

            <p className="mt-1 text-small text-muted flex items-center gap-2">
              <ClockIcon className="size-3.5" />
              Member since {memberSince}
            </p>

            {/* Avatar controls */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="avatar-file-input"
                onChange={handleAvatarPicked}
                disabled={uploadingAvatar}
              />
              <label
                htmlFor="avatar-file-input"
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-small font-medium text-ink shadow-2xs transition-colors hover:bg-subtle cursor-pointer focus-within:ring-2 focus-within:ring-brand-600",
                  uploadingAvatar && "opacity-50 pointer-events-none"
                )}
              >
                <CameraIcon className="size-4 text-muted" />
                <span>{avatarUrl ? "Change picture" : "Upload picture"}</span>
              </label>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  disabled={uploadingAvatar}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-small font-medium text-critical-ink hover:bg-critical-soft transition-colors cursor-pointer"
                >
                  <TrashIcon className="size-3.5 text-critical-solid" />
                  <span>Remove</span>
                </button>
              )}

              <span className="text-caption text-muted">JPG, PNG, or WebP up to 2 MB</span>
            </div>

            {avatarError && (
              <p className="mt-2 text-small text-critical-ink flex items-center gap-1.5">
                <AlertIcon className="size-4 shrink-0 text-critical-solid" />
                {avatarError}
              </p>
            )}
            {avatarSuccess && (
              <p className="mt-2 text-small text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircleIcon className="size-4 shrink-0" />
                {avatarSuccess}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 2. Main Profile Information Form */}
      <form onSubmit={handleProfileSubmit} className="space-y-8">
        {/* Alerts */}
        {profileSuccess && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-small text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2.5">
            <CheckCircleIcon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{profileSuccess}</span>
          </div>
        )}
        {profileError && (
          <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-small text-critical-ink dark:border-red-900 dark:bg-red-950/40 flex items-center gap-2.5">
            <AlertIcon className="size-5 shrink-0 text-critical-solid" />
            <span>{profileError}</span>
          </div>
        )}

        {/* Section: Personal Information */}
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-2xs">
          <div className="border-b border-line pb-4 mb-6">
            <h2 className="text-base font-semibold text-ink">Personal Information</h2>
            <p className="text-small text-muted mt-0.5">
              Manage your personal identity, contact details, and location.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="block text-small font-medium text-ink mb-1.5">
                First name
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                defaultValue={initialProfile.firstName}
                maxLength={50}
                required
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-small font-medium text-ink mb-1.5">
                Last name
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                defaultValue={initialProfile.lastName}
                maxLength={50}
                required
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="email" className="block text-small font-medium text-ink">
                  Email address
                </label>
                <span className="inline-flex items-center gap-1 text-micro text-muted font-medium">
                  <LockIcon className="size-3" />
                  Read-only
                </span>
              </div>
              <input
                type="email"
                id="email"
                value={initialProfile.email}
                disabled
                aria-describedby="email-hint"
                className="w-full rounded-lg border border-line bg-subtle/80 px-3 py-2 text-small text-muted cursor-not-allowed select-none"
              />
              <p id="email-hint" className="mt-1 text-micro text-muted">
                Managed by workspace authentication. Contact your team admin to request an email change.
              </p>
            </div>

            <div>
              <label htmlFor="phone" className="block text-small font-medium text-ink mb-1.5">
                Phone number
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                defaultValue={initialProfile.phone}
                maxLength={30}
                placeholder="+1 (555) 000-0000"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="city" className="block text-small font-medium text-ink mb-1.5">
                  City
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  defaultValue={initialProfile.city}
                  maxLength={100}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label htmlFor="state" className="block text-small font-medium text-ink mb-1.5">
                  State / Province
                </label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  defaultValue={initialProfile.state}
                  maxLength={100}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label htmlFor="country" className="block text-small font-medium text-ink mb-1.5">
                  Country
                </label>
                <input
                  type="text"
                  id="country"
                  name="country"
                  defaultValue={initialProfile.country}
                  maxLength={100}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section: Professional & Workspace Details */}
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-2xs">
          <div className="border-b border-line pb-4 mb-6">
            <h2 className="text-base font-semibold text-ink">Professional & Organization</h2>
            <p className="text-small text-muted mt-0.5">
              Information about your organization, role, and compliance responsibilities.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="companyName" className="block text-small font-medium text-ink mb-1.5">
                Company / Organization
              </label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                defaultValue={initialProfile.companyName}
                maxLength={100}
                placeholder="e.g. Acme Healthcare Inc."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label htmlFor="jobTitle" className="block text-small font-medium text-ink mb-1.5">
                Job title
              </label>
              <input
                type="text"
                id="jobTitle"
                name="jobTitle"
                defaultValue={initialProfile.jobTitle}
                maxLength={100}
                placeholder="e.g. Compliance Lead / Marketing Director"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="department" className="block text-small font-medium text-ink mb-1.5">
                Department
              </label>
              <input
                type="text"
                id="department"
                name="department"
                defaultValue={initialProfile.department}
                maxLength={100}
                placeholder="e.g. Regulatory Affairs / Creative Operations"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="bio" className="block text-small font-medium text-ink">
                  Bio / Responsibilities
                </label>
                <span className="text-micro text-muted font-mono">{bioCharCount} / 500</span>
              </div>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                maxLength={500}
                defaultValue={initialProfile.bio}
                onChange={(e) => setBioCharCount(e.target.value.length)}
                placeholder="Briefly describe your role, campaign focus, or compliance areas..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
          </div>
        </section>

        {/* Section: Regional & Localization Preferences */}
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-2xs">
          <div className="border-b border-line pb-4 mb-6">
            <h2 className="text-base font-semibold text-ink">Preferences</h2>
            <p className="text-small text-muted mt-0.5">
              Set your time zone and preferred language for dates and notifications.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="timezone" className="block text-small font-medium text-ink mb-1.5">
                Time zone
              </label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={initialProfile.timezone}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="preferredLanguage"
                className="block text-small font-medium text-ink mb-1.5"
              >
                Preferred language
              </label>
              <select
                id="preferredLanguage"
                name="preferredLanguage"
                defaultValue={initialProfile.preferredLanguage}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                {COMMON_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Save Profile Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isProfilePending}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-2.5 text-small font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {isProfilePending ? "Saving changes..." : "Save profile changes"}
          </button>
        </div>
      </form>

      {/* 3. Security & Password Change Card */}
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-2xs">
        <div className="border-b border-line pb-4 mb-6">
          <h2 className="text-base font-semibold text-ink">Security & Password</h2>
          <p className="text-small text-muted mt-0.5">
            Update your account password with current-password verification.
          </p>
        </div>

        {demoSession ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-950/30 text-small text-muted flex items-start gap-3">
            <LockIcon className="size-5 shrink-0 text-brand-600 mt-0.5" />
            <div>
              <p className="font-medium text-ink">Demo account active</p>
              <p className="mt-0.5">
                Password changes are disabled for one-click demo sessions to protect shared demonstration environments.
              </p>
            </div>
          </div>
        ) : (
          <form ref={passwordFormRef} onSubmit={handlePasswordSubmit} className="space-y-6">
            {passwordSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-small text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2.5">
                <CheckCircleIcon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{passwordSuccess}</span>
              </div>
            )}
            {passwordError && (
              <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-small text-critical-ink dark:border-red-900 dark:bg-red-950/40 flex items-center gap-2.5">
                <AlertIcon className="size-5 shrink-0 text-critical-solid" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="currentPassword"
                  className="block text-small font-medium text-ink mb-1.5"
                >
                  Current password
                </label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-small font-medium text-ink mb-1.5"
                >
                  New password
                </label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  required
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                <span className="text-micro text-muted mt-1 block">At least 8 characters</span>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-small font-medium text-ink mb-1.5"
                >
                  Confirm new password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  required
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isPasswordPending}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-5 py-2 text-small font-medium text-ink shadow-2xs transition-colors hover:bg-subtle disabled:opacity-50 cursor-pointer"
              >
                {isPasswordPending ? "Verifying..." : "Update password"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
