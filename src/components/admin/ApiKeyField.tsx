'use client'

import * as React from 'react'
import { FieldLabel, useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'

import './ApiKeyField.scss'

const MASK = '••••••••'

/**
 * Masked field component for provider API keys.
 *
 * The stored key is never displayed. When a key exists the user sees a mask
 * plus a "Replace key" control that reveals a password input to enter a new
 * value (and a "Clear" control to remove it). If no key is set, the password
 * input is shown directly.
 *
 * The value itself stays in Payload form state (Admin-only field access), so
 * an untouched key is preserved on save; only a replacement changes it.
 */
export const ApiKeyField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { setValue, showError, value } = useField<string>({ path })
  const [replacing, setReplacing] = React.useState(false)
  const [draft, setDraft] = React.useState('')

  const hasValue = typeof value === 'string' && value.length > 0
  const isEditing = replacing || (!hasValue && !readOnly)
  const last4 = hasValue ? value.slice(-4) : ''

  function commit() {
    setValue(draft.trim())
    setDraft('')
    setReplacing(false)
  }

  function cancel() {
    setDraft('')
    setReplacing(false)
  }

  function clear() {
    setValue('')
    setDraft('')
    setReplacing(false)
  }

  return (
    <div className={`field-type text${showError ? ' error' : ''}${readOnly ? ' read-only' : ''}`}>
      <FieldLabel label={field?.label} path={path} required={field?.required} />

      <div className="api-key-field">
        {hasValue && !isEditing && (
          <div className="api-key-field__masked">
            <code className="api-key-field__value">
              {MASK}
              {last4}
            </code>
            {!readOnly && (
              <div className="api-key-field__actions">
                <button
                  className="api-key-field__btn"
                  onClick={() => {
                    setDraft('')
                    setReplacing(true)
                  }}
                  type="button"
                >
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

        {isEditing && (
          <div className="api-key-field__editor">
            <input
              aria-label="Provider API key"
              autoComplete="off"
              className="api-key-field__input"
              disabled={readOnly}
              id={`field-${path?.replace(/\./g, '__')}`}
              name={path}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={hasValue ? 'Enter a new key' : 'Paste provider API key'}
              type="password"
              value={draft}
            />
            {!readOnly && (
              <div className="api-key-field__actions">
                <button
                  className="api-key-field__btn api-key-field__btn--primary"
                  disabled={draft.trim().length === 0}
                  onClick={commit}
                  type="button"
                >
                  Save key
                </button>
                {hasValue && (
                  <button className="api-key-field__btn" onClick={cancel} type="button">
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!hasValue && !isEditing && !readOnly && (
          <p className="api-key-field__empty">No key set.</p>
        )}

        {field?.admin?.description && (
          <p className="api-key-field__description">
            {typeof field.admin.description === 'string'
              ? field.admin.description
              : 'Stored encrypted; only Admins can read or edit.'}
          </p>
        )}
      </div>
    </div>
  )
}
