'use client'

import * as React from 'react'
import { FieldLabel, useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'

import { API_KEY_MASK, isMaskedApiKey } from '@/lib/api-key-mask'
import './ApiKeyField.scss'

const MASK = '••••••••'

/**
 * Masked field component for provider API keys.
 *
 * The server returns a sentinel (`API_KEY_MASK`), never the plaintext, so the
 * browser never sees the stored key. States:
 *   - a key is stored  → mask + "Replace key" / "Clear"
 *   - no key stored    → password input (type a key; it persists on Save)
 *   - replacing        → password input (empty) + "Cancel"
 *
 * The value is bound directly to Payload form state, so the document's own
 * Save persists it (there is no separate "save key" step).
 */
export const ApiKeyField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { setValue, showError, value } = useField<string>({ path })
  const [replacing, setReplacing] = React.useState(false)

  const stored = isMaskedApiKey(value)
  const typed = typeof value === 'string' && value.length > 0 && !stored
  const editing = replacing || !stored

  function startReplace() {
    setValue('')
    setReplacing(true)
  }

  function cancel() {
    setValue(API_KEY_MASK)
    setReplacing(false)
  }

  function clear() {
    setValue('')
    setReplacing(false)
  }

  return (
    <div className={`field-type text${showError ? ' error' : ''}${readOnly ? ' read-only' : ''}`}>
      <FieldLabel label={field?.label} path={path} required={field?.required} />

      <div className="api-key-field">
        {stored && !editing && (
          <div className="api-key-field__masked">
            <code className="api-key-field__value">{MASK}</code>
            <span className="api-key-field__status">Key is set</span>
            {!readOnly && (
              <div className="api-key-field__actions">
                <button className="api-key-field__btn" onClick={startReplace} type="button">
                  Replace key
                </button>
                <button
                  className="api-key-field__btn api-key-field__btn--danger"
                  onClick={clear}
                  type="button"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {editing && (
          <div className="api-key-field__editor">
            <input
              aria-label="Provider API key"
              autoComplete="off"
              className="api-key-field__input"
              disabled={readOnly}
              id={`field-${path?.replace(/\./g, '__')}`}
              name={path}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste provider API key"
              type="password"
              value={typeof value === 'string' && !stored ? value : ''}
            />
            {!readOnly && (
              <div className="api-key-field__actions">
                {stored && (
                  <button className="api-key-field__btn" onClick={cancel} type="button">
                    Cancel
                  </button>
                )}
                {(typed || replacing) && (
                  <button
                    className="api-key-field__btn api-key-field__btn--danger"
                    onClick={clear}
                    type="button"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!stored && !typed && (
          <p className="api-key-field__empty">
            No key set. Paste one above, or use <code>keyRef</code> to read it from an
            environment/secret variable.
          </p>
        )}
        {typed && (
          <p className="api-key-field__status">
            New key — it will be stored when you save this provider.
          </p>
        )}

        {field?.admin?.description && (
          <p className="api-key-field__description">
            {typeof field.admin.description === 'string'
              ? field.admin.description
              : 'Stored encrypted; only Admins can edit.'}
          </p>
        )}
      </div>
    </div>
  )
}
