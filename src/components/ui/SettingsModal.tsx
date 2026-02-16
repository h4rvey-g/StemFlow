"use client"

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { saveApiKeys, loadApiKeys, type ApiKeyState, type ApiProvider } from '@/lib/api-keys'
import { fetchProviderModels } from '@/lib/fetch-provider-models'
import {
  DEFAULT_PROMPT_SETTINGS,
  loadPromptSettings,
  savePromptSettings,
  type PromptSettings,
} from '@/lib/prompt-settings'
import {
  useStore,
  type ExperimentalCondition,
  EXPERIMENTAL_CONDITION_VALUES,
} from '@/stores/useStore'
import i18n, { LANGUAGE_STORAGE_KEY, type SupportedLanguage } from '@/lib/i18n'

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const OPENAI_MODELS = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] as const
const ANTHROPIC_MODELS = ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] as const
const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-3-pro-preview'] as const
type SettingsTab = 'general' | 'model' | 'prompt'

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('model');
  const [provider, setProvider] = useState<ApiProvider | null>(null);
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('');
  const [openaiModel, setOpenaiModel] = useState<string>(OPENAI_MODELS[0]);
  const [anthropicModel, setAnthropicModel] = useState<string>(ANTHROPIC_MODELS[0]);
  const [geminiModel, setGeminiModel] = useState<string>(GEMINI_MODELS[0]);
  const [openaiFastModel, setOpenaiFastModel] = useState<string>(OPENAI_MODELS[0]);
  const [anthropicFastModel, setAnthropicFastModel] = useState<string>(ANTHROPIC_MODELS[0]);
  const [geminiFastModel, setGeminiFastModel] = useState<string>(GEMINI_MODELS[0]);
  const [fetchedModelOptions, setFetchedModelOptions] = useState<Partial<Record<ApiProvider, string[]>>>({});
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelFetchMessage, setModelFetchMessage] = useState('');
  const globalGoal = useStore(state => state.globalGoal);
  const setGlobalGoal = useStore(state => state.setGlobalGoal);
  const [localGoal, setLocalGoal] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [promptSettings, setPromptSettings] = useState<PromptSettings>(DEFAULT_PROMPT_SETTINGS);
  const experimentalConditions = useStore(state => state.experimentalConditions);
  const setExperimentalConditions = useStore(state => state.setExperimentalConditions);
  const [localConditions, setLocalConditions] = useState<ExperimentalCondition[]>([]);

  useEffect(() => {
    setIsMounted(true);

    return () => {
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setActiveTab('general');
      setLocalGoal(globalGoal);
      setLocalConditions([...experimentalConditions]);
      setFetchedModelOptions({});
      setModelFetchMessage('');
      setPromptSettings(loadPromptSettings());
      loadApiKeys().then((keys) => {
        if (keys.provider) setProvider(keys.provider);
        if (keys.openaiKey) setOpenaiKey(keys.openaiKey);
        if (keys.anthropicKey) setAnthropicKey(keys.anthropicKey);
        if (keys.geminiKey) setGeminiKey(keys.geminiKey);

        if (keys.openaiBaseUrl) setOpenaiBaseUrl(keys.openaiBaseUrl);
        if (keys.anthropicBaseUrl) setAnthropicBaseUrl(keys.anthropicBaseUrl);
        if (keys.openaiModel) setOpenaiModel(keys.openaiModel);
        if (keys.anthropicModel) setAnthropicModel(keys.anthropicModel);
        if (keys.geminiModel) setGeminiModel(keys.geminiModel);
        if (keys.openaiFastModel) setOpenaiFastModel(keys.openaiFastModel);
        if (keys.anthropicFastModel) setAnthropicFastModel(keys.anthropicFastModel);
        if (keys.geminiFastModel) setGeminiFastModel(keys.geminiFastModel);
        setIsLoading(false);
      });
    }
  }, [isOpen, globalGoal, experimentalConditions]);

  const handleSaveModelSettings = async () => {
    setStatus('idle');
    setErrorMessage('');

    if (!provider) {
      setStatus('error');
      setErrorMessage(t('settings.model.validationErrors.providerRequired'));
      return;
    }

    if (provider === 'openai-compatible' && !openaiBaseUrl.trim()) {
      setStatus('error');
      setErrorMessage(t('settings.model.validationErrors.baseUrlRequired'));
      return;
    }

    const newState: ApiKeyState = {
      provider,
      openaiKey: openaiKey || null,
      anthropicKey: anthropicKey || null,
      geminiKey: geminiKey || null,

      openaiBaseUrl: openaiBaseUrl.trim() || null,
      anthropicBaseUrl: anthropicBaseUrl.trim() || null,
      openaiModel,
      anthropicModel,
      geminiModel,
      openaiFastModel,
      anthropicFastModel,
      geminiFastModel,
    };

    const result = await saveApiKeys(newState);
    
    if (result.success) {
      setGlobalGoal(localGoal);
      setStatus('saved');
      onClose();
    } else {
      setStatus('error');
      setErrorMessage(result.error || t('settings.model.validationErrors.saveFailed'));
    }
  };

  const handleSavePromptSettings = () => {
    setStatus('idle');
    setErrorMessage('');

    const result = savePromptSettings(promptSettings);
    if (result.success) {
      setStatus('saved');
      onClose();
      return;
    }

    setStatus('error');
    setErrorMessage(result.error || t('settings.model.validationErrors.saveFailed'));
  };

  const handleObservationToMechanismGenerationPromptChange = (value: string) => {
    setPromptSettings((prev) => ({
      ...prev,
      nextStepsObservationToMechanismPromptTemplate: value,
    }));
  };

  const handleMechanismToValidationGenerationPromptChange = (value: string) => {
    setPromptSettings((prev) => ({
      ...prev,
      nextStepsMechanismToValidationPromptTemplate: value,
    }));
  };

  const handleResetPromptDefaults = () => {
    setPromptSettings((prev) => ({
      ...prev,
      nextStepsObservationToMechanismPromptTemplate:
        DEFAULT_PROMPT_SETTINGS.nextStepsObservationToMechanismPromptTemplate,
      nextStepsMechanismToValidationPromptTemplate:
        DEFAULT_PROMPT_SETTINGS.nextStepsMechanismToValidationPromptTemplate,
    }));
  };

  const handleSaveGeneralSettings = () => {
    setStatus('idle');
    setErrorMessage('');
    setExperimentalConditions(localConditions);
    setStatus('saved');
    onClose();
  };

  const handleToggleCondition = (condition: ExperimentalCondition) => {
    setLocalConditions((prev) =>
      prev.includes(condition)
        ? prev.filter((c) => c !== condition)
        : [...prev, condition],
    );
  };

  const handleLanguageChange = (newLanguage: SupportedLanguage) => {
    i18n.changeLanguage(newLanguage);
    
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
      }
    } catch (error) {
      console.error('Failed to persist language preference:', error);
    }
  };

  const currentKey =
    provider === 'openai' || provider === 'openai-compatible'
      ? openaiKey
      : provider === 'anthropic'
        ? anthropicKey
        : provider === 'gemini'
          ? geminiKey
        : '';
  const setCurrentKey = (val: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiKey(val);
    else if (provider === 'anthropic') setAnthropicKey(val);
    else if (provider === 'gemini') setGeminiKey(val);
  };

  const currentModel =
    provider === 'openai' || provider === 'openai-compatible'
      ? openaiModel
      : provider === 'anthropic'
        ? anthropicModel
      : provider === 'gemini'
        ? geminiModel
      : '';

  const currentBaseUrl =
    provider === 'openai' || provider === 'openai-compatible'
      ? openaiBaseUrl
      : provider === 'anthropic'
        ? anthropicBaseUrl
        : '';

  const setCurrentBaseUrl = (value: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiBaseUrl(value);
    else if (provider === 'anthropic') setAnthropicBaseUrl(value);
  };

  const setCurrentModel = (value: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiModel(value);
    else if (provider === 'anthropic') setAnthropicModel(value);
    else if (provider === 'gemini') setGeminiModel(value);
  };

  const currentFastModel =
    provider === 'openai' || provider === 'openai-compatible'
      ? openaiFastModel
      : provider === 'anthropic'
        ? anthropicFastModel
      : provider === 'gemini'
        ? geminiFastModel
      : '';

  const setCurrentFastModel = (value: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiFastModel(value);
    else if (provider === 'anthropic') setAnthropicFastModel(value);
    else if (provider === 'gemini') setGeminiFastModel(value);
  };

  const fallbackModelOptions =
    provider === 'openai' || provider === 'openai-compatible'
      ? OPENAI_MODELS
      : provider === 'anthropic'
        ? ANTHROPIC_MODELS
      : provider === 'gemini'
        ? GEMINI_MODELS
      : [];

  const providerModelOptions =
    provider && fetchedModelOptions[provider] && fetchedModelOptions[provider]!.length > 0
      ? fetchedModelOptions[provider]!
      : [...fallbackModelOptions];

  const selectedModelOptions = [currentModel, currentFastModel].filter(
    (value): value is string => Boolean(value),
  );

  const modelOptions = Array.from(new Set([...selectedModelOptions, ...providerModelOptions]));

  const handleFetchModels = async () => {
    if (!provider) {
      setModelFetchMessage(t('settings.model.fetchModelMessages.selectProvider'));
      return;
    }

    if (provider === 'gemini') {
      setModelFetchMessage(t('settings.model.fetchModelMessages.geminiNotSupported'));
      return;
    }

    if (!currentKey) {
      setModelFetchMessage(t('settings.model.fetchModelMessages.enterApiKey'));
      return;
    }

    if (provider === 'openai-compatible' && !currentBaseUrl.trim()) {
      setModelFetchMessage(t('settings.model.fetchModelMessages.enterBaseUrl'));
      return;
    }

    setIsFetchingModels(true);
    setModelFetchMessage('');

    const result = await fetchProviderModels(provider, currentKey, currentBaseUrl || undefined);

    if (!result.success) {
      setModelFetchMessage(result.error || t('settings.model.fetchModelMessages.failed'));
      setIsFetchingModels(false);
      return;
    }

    const fetched = Array.from(new Set((result.models ?? []).map((model) => model.id).filter(Boolean)));

    if (fetched.length === 0) {
      setModelFetchMessage(t('settings.model.fetchModelMessages.noModels'));
      setIsFetchingModels(false);
      return;
    }

    setFetchedModelOptions((prev) => ({ ...prev, [provider]: fetched }));

    if (!fetched.includes(currentModel)) {
      setCurrentModel(fetched[0]);
    }

    setModelFetchMessage(t('settings.model.fetchModelMessages.loaded', { count: fetched.length }));
    setIsFetchingModels(false);
  };

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-6 backdrop-blur-sm"
      data-testid="settings-modal"
    >
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-700/60">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'general'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                {t('settings.tabs.general')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('model')}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'model'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                {t('settings.tabs.model')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('prompt')}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'prompt'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                {t('settings.tabs.prompts')}
              </button>
            </div>

            {activeTab === 'model' ? (
              <>
                <div>
                  <label htmlFor="settings-provider" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.model.providerLabel')}
                  </label>
                  <select
                    id="settings-provider"
                    value={provider ?? ''}
                    onChange={(e) => setProvider(e.target.value ? (e.target.value as ApiProvider) : null)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">{t('settings.model.providerPlaceholder')}</option>
                    <option value="openai">OpenAI</option>
                    <option value="openai-compatible">OpenAI-Compatible</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="settings-api-key" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.model.apiKeyLabel', { 
                      provider: provider === 'openai' ? 'OpenAI' : provider === 'openai-compatible' ? 'OpenAI-Compatible' : provider === 'anthropic' ? 'Anthropic' : provider === 'gemini' ? 'Gemini' : 'Provider'
                    })}
                  </label>
                  <div className="relative">
                    <input
                      id="settings-api-key"
                      type={showKey ? 'text' : 'password'}
                      value={currentKey}
                      onChange={(e) => setCurrentKey(e.target.value)}
                      placeholder={t('settings.model.apiKeyPlaceholder', { 
                        placeholder: provider === 'anthropic' ? 'sk-ant-...' : provider === 'gemini' ? 'AIza...' : 'sk-...'
                      })}
                      disabled={!provider}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      {showKey ? t('settings.model.hideKey') : t('settings.model.showKey')}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.model.apiKeyHelper')}
                  </p>
                </div>

                {provider === 'openai-compatible' ? (
                  <div>
                    <label htmlFor="settings-base-url" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.model.baseUrlLabel')}
                    </label>
                    <input
                      id="settings-base-url"
                      type="url"
                      value={currentBaseUrl}
                      onChange={(e) => setCurrentBaseUrl(e.target.value)}
                      placeholder={t('settings.model.baseUrlPlaceholder')}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.model.baseUrlHelper')}
                    </p>
                  </div>
                ) : null}

                <div>
                  <label htmlFor="settings-model" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.model.thinkModelLabel')}
                  </label>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.model.thinkModelHelper')}
                  </p>
                  <select
                    id="settings-model"
                    value={currentModel}
                    onChange={(e) => setCurrentModel(e.target.value)}
                    disabled={!provider}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    {modelOptions.map((modelOption) => (
                      <option key={modelOption} value={modelOption}>
                        {modelOption}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="settings-fast-model" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.model.fastModelLabel')}
                  </label>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.model.fastModelHelper')}
                  </p>
                  <select
                    id="settings-fast-model"
                    value={currentFastModel}
                    onChange={(e) => setCurrentFastModel(e.target.value)}
                    disabled={!provider}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    {modelOptions.map((modelOption) => (
                      <option key={modelOption} value={modelOption}>
                        {modelOption}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={!provider || !currentKey || isFetchingModels || provider === 'gemini'}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {isFetchingModels ? t('settings.model.fetching') : t('settings.model.fetchModels')}
                    </button>
                    {modelFetchMessage ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{modelFetchMessage}</span>
                    ) : null}
                  </div>
                </div>


                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.model.researchGoalLabel')}
                  </label>
                  <textarea
                    value={localGoal}
                    onChange={(e) => setLocalGoal(e.target.value)}
                    placeholder={t('settings.model.researchGoalPlaceholder')}
                    className="h-24 w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </>
            ) : activeTab === 'prompt' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {t('settings.prompts.editorHelper')}
                  </p>
                  <button
                    type="button"
                    onClick={handleResetPromptDefaults}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {t('settings.prompts.resetButton')}
                  </button>
                </div>
                <div>
                  <label
                    htmlFor="prompt-next-steps-observation-mechanism"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t('settings.prompts.observationToMechanismLabel')}
                  </label>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.prompts.observationToMechanismHelper')}
                  </p>
                  <textarea
                    id="prompt-next-steps-observation-mechanism"
                    rows={14}
                    value={promptSettings.nextStepsObservationToMechanismPromptTemplate}
                    onChange={(e) => handleObservationToMechanismGenerationPromptChange(e.target.value)}
                    className="w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prompt-next-steps-mechanism-validation"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t('settings.prompts.mechanismToValidationLabel')}
                  </label>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.prompts.mechanismToValidationHelper')}
                  </p>
                  <textarea
                    id="prompt-next-steps-mechanism-validation"
                    rows={14}
                    value={promptSettings.nextStepsMechanismToValidationPromptTemplate}
                    onChange={(e) => handleMechanismToValidationGenerationPromptChange(e.target.value)}
                    className="w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="settings-language" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.general.language')}
                  </label>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.general.languageDescription')}
                  </p>
                  <select
                    id="settings-language"
                    value={i18n.language}
                    onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="en">English</option>
                    <option value="zh-CN">简体中文</option>
                  </select>
                </div>
                
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.model.experimentalConditions')}
                  </label>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.model.experimentalConditionsDescription')}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {EXPERIMENTAL_CONDITION_VALUES.map((condition) => (
                      <label
                        key={condition}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700/50"
                      >
                        <input
                          type="checkbox"
                          checked={localConditions.includes(condition)}
                          onChange={() => handleToggleCondition(condition)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-500 dark:bg-gray-700"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {t(`settings.model.${condition === 'dry-lab' ? 'dryLab' : 'wetLab'}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <span className={`text-sm text-green-600 transition-opacity ${status === 'saved' ? 'opacity-100' : 'opacity-0'}`}>
                {t('settings.status.saved')}
              </span>
              <span className={`text-sm text-red-600 transition-opacity ${status === 'error' ? 'opacity-100' : 'opacity-0'}`}>
                {errorMessage || t('settings.status.error')}
              </span>
              <button
                onClick={onClose}
                className="rounded-md border border-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-200 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={activeTab === 'model' ? handleSaveModelSettings : activeTab === 'prompt' ? handleSavePromptSettings : handleSaveGeneralSettings}
                disabled={
                  activeTab === 'model'
                    ? !provider || !currentKey || (provider === 'openai-compatible' && !openaiBaseUrl.trim())
                    : false
                }
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeTab === 'model' ? t('settings.actions.saveModel') : activeTab === 'prompt' ? t('settings.actions.savePrompt') : t('settings.actions.saveGeneral')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
