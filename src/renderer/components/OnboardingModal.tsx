import React, { useState, useEffect } from 'react';
import type { PermissionStatus } from '../window';

interface OnboardingModalProps {
  onComplete: () => void;
}

type PermissionKey = 'keychain' | 'systemEvents' | 'accessibility';

interface PermissionStep {
  key: PermissionKey;
  title: string;
  description: string;
  icon: string;
}

const PERMISSIONS: PermissionStep[] = [
  {
    key: 'keychain',
    title: '🔐 Keychain Access',
    description: 'Clippy needs keychain access to securely store your settings and sensitive data.',
    icon: '🔑',
  },
  {
    key: 'systemEvents',
    title: '⚙️ System Events',
    description: 'This allows Clippy to automate copy/paste actions and integrate with your system.',
    icon: '⚙️',
  },
  {
    key: 'accessibility',
    title: '✨ Accessibility',
    description: 'Accessibility permissions let Clippy paste content directly into other apps for you.',
    icon: '✨',
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Check permissions on mount and after each step
  useEffect(() => {
    checkPerms();
  }, []);

  const checkPerms = async () => {
    setLoading(true);
    try {
      const perms = await window.clipstack.checkPermissions();
      setPermissions(perms);
    } catch (e) {
      console.error('Failed to check permissions:', e);
      setPermissions({ keychain: false, systemEvents: false, accessibility: false });
    }
    setLoading(false);
  };

  const openSystemSettings = async () => {
    try {
      await window.clipstack.openAccessibilitySettings();
    } catch (e) {
      console.error('Failed to open system settings:', e);
    }
  };

  const handleNext = async () => {
    try {
      if (currentStep < PERMISSIONS.length - 1) {
        // Wait a moment then check permissions again
        await new Promise((resolve) => setTimeout(resolve, 500));
        await checkPerms();
        setCurrentStep(currentStep + 1);
      } else {
        // All done
        await window.clipstack.completeOnboarding();
        onComplete();
      }
    } catch (e) {
      console.error('Error in handleNext:', e);
    }
  };

  const handleSkip = async () => {
    try {
      // User skipped onboarding
      await window.clipstack.completeOnboarding();
      onComplete();
    } catch (e) {
      console.error('Error in handleSkip:', e);
    }
  };

  if (loading || !permissions) {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-modal">
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const permission = PERMISSIONS[currentStep];
  const isGranted = permissions[permission.key];
  const allGranted = permissions.keychain && permissions.systemEvents && permissions.accessibility;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <h1>👋 Welcome to Clippy</h1>
          <p>Let's set up the permissions you need to paste like a pro!</p>
        </div>

        <div className="onboarding-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${((currentStep + 1) / PERMISSIONS.length) * 100}%` }} />
          </div>
          <p className="progress-text">
            Step {currentStep + 1} of {PERMISSIONS.length}
          </p>
        </div>

        <div className="onboarding-step">
          <div className="step-icon">{permission.icon}</div>
          <h2>{permission.title}</h2>
          <p className="step-description">{permission.description}</p>

          <div className="step-status">
            {isGranted ? (
              <div className="status-granted">
                ✓ Already done! You're all set for this step.
              </div>
            ) : (
              <div className="status-pending">
                ⏳ This permission hasn't been granted yet.
              </div>
            )}
          </div>

          {!isGranted && (
            <button className="settings-button" onClick={() => openSystemSettings()}>
              📱 Open System Settings
            </button>
          )}
        </div>

        <div className="onboarding-footer">
          {allGranted && currentStep === PERMISSIONS.length - 1 ? (
            <button className="button-primary" onClick={handleNext}>
              🎉 You're All Set!
            </button>
          ) : (
            <>
              <button className="button-secondary" onClick={handleSkip}>
                Skip Setup
              </button>
              <button
                className="button-primary"
                onClick={handleNext}
                disabled={!isGranted && currentStep < PERMISSIONS.length - 1}
              >
                {currentStep === PERMISSIONS.length - 1 ? 'Done' : 'Next'}
              </button>
            </>
          )}
        </div>

        {!allGranted && currentStep === PERMISSIONS.length - 1 && (
          <div className="onboarding-warning">
            <p>⚠️ <strong>Note:</strong> Some permissions weren't granted. Clippy won't work without all three. You can grant them anytime in System Settings.</p>
          </div>
        )}
      </div>
    </div>
  );
};
