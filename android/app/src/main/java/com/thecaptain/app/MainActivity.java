package com.thecaptain.app;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

import com.google.android.gms.ads.MobileAds;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Fix WebView compatibility for all API levels
        configureWebViewDebugging();
        
        super.onCreate(savedInstanceState);
        
        // Initialize consent after super.onCreate()
        requestConsent();
    }

        private void configureWebViewDebugging() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { 
                        WebView.setWebContentsDebuggingEnabled(false);
                        Log.d(TAG, "WebView debugging enabled");
                    } else {
                
                        try {
                            WebView.setWebContentsDebuggingEnabled(false);
                        } catch (NoSuchMethodError e) {
                            Log.w(TAG, "setWebContentsDebuggingEnabled not available on this device");
                        }
                        Log.d(TAG, "WebView debugging disabled for API " + Build.VERSION.SDK_INT);
                    }
                }
            } catch (NoClassDefFoundError e) {
                Log.e(TAG, "WebView class not found: " + e.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "Failed to configure WebView: " + e.getMessage());
            }
        }

    private void requestConsent() {
        try {
            
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
                Log.w(TAG, "Skipping consent - Android version too old: API " + Build.VERSION.SDK_INT);
                initAds();
                return;
            }

            ConsentInformation consentInformation = UserMessagingPlatform.getConsentInformation(this);
            
            ConsentRequestParameters params = new ConsentRequestParameters.Builder()
                    .setTagForUnderAgeOfConsent(false)
                    .build();

            consentInformation.requestConsentInfoUpdate(
                    this,
                    params,
                    () -> {
                        Log.d(TAG, "Consent info update successful");
                        if (consentInformation.isConsentFormAvailable()) {
                            loadForm(consentInformation);
                        } else {
                            initAds();
                        }
                    },
                    formError -> {
                        Log.e(TAG, "Consent info update failed: " + formError.getMessage());
                        // Still try to initialize ads even if consent fails
                        initAds();
                    }
            );
        } catch (NoClassDefFoundError e) {
            // Handle missing UMP classes on older devices
            Log.e(TAG, "UMP classes not available: " + e.getMessage());
            initAds();
        } catch (Exception e) {
            Log.e(TAG, "Error in requestConsent: " + e.getMessage());
            initAds();
        }
    }

    private void loadForm(ConsentInformation consentInformation) {
        try {
            UserMessagingPlatform.loadConsentForm(
                    this,
                    consentForm -> {
                        Log.d(TAG, "Consent form loaded successfully");
                        if (consentInformation.getConsentStatus() == ConsentInformation.ConsentStatus.REQUIRED) {
                            consentForm.show(
                                    this,
                                    formError -> {
                                        if (formError != null) {
                                            Log.e(TAG, "Error showing consent form: " + formError.getMessage());
                                        } else {
                                            Log.d(TAG, "Consent form shown successfully");
                                        }
                                        initAds();
                                    }
                            );
                        } else {
                            initAds();
                        }
                    },
                    formError -> {
                        Log.e(TAG, "Error loading consent form: " + formError.getMessage());
                        initAds();
                    }
            );
        } catch (Exception e) {
            Log.e(TAG, "Error loading form: " + e.getMessage());
            initAds();
        }
    }

    private void initAds() {
        try {
           
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
                Log.w(TAG, "Skipping MobileAds initialization - Android version too old");
                return;
            }
            
            MobileAds.initialize(this, initializationStatus -> {
                Log.d(TAG, "MobileAds initialized successfully");
            });
        } catch (NoClassDefFoundError e) {
            Log.e(TAG, "MobileAds classes not available: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize MobileAds: " + e.getMessage());
        }
    }
}