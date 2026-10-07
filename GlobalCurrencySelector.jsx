import React, { useState, useRef, useEffect } from 'react';
import { CURRENCIES, getCurrency, searchCurrencies } from './currencyData';
import './GlobalCurrencySelector.css';

export default function GlobalCurrencySelector({ selectedCurrency, onSelectCurrency, showExchangeRate = true, darkMode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const isDark = darkMode !== undefined ? darkMode : (typeof document !== 'undefined' && document.body.classList.contains('dark-theme'));
  const current = getCurrency(selectedCurrency);
  const filteredCurrencies = searchCurrencies(searchQuery);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelect = (currency) => {
    onSelectCurrency(currency.code);
    setIsOpen(false);
  };

  return (
    <div className={`global-currency-selector-wrapper ${isDark ? 'dark-theme' : 'light-theme'}`} ref={dropdownRef}>
      <button
        type="button"
        className={`global-currency-trigger-btn ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="currency-flag-icon">{current.flag}</span>
        <span className="currency-code-text">{current.code}</span>
        <span className="currency-symbol-tag">({current.symbol})</span>
        <i className={`fa-solid fa-chevron-down currency-arrow-icon ${isOpen ? 'rotate' : ''}`}></i>
      </button>

      {/* Floating Exchange Rate Badge */}
      {showExchangeRate && current.code !== 'USD' && (
        <span className="currency-exchange-rate-badge" title={`Current exchange rate: 1 USD = ${current.rate} ${current.code}`}>
          <i className="fa-solid fa-arrow-right-arrow-left"></i> 1 USD = {current.rate.toLocaleString()} {current.code}
        </span>
      )}

      {isOpen && (
        <div className="global-currency-dropdown-menu" role="listbox">
          <div className="currency-search-header">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              ref={searchInputRef}
              type="text"
              className="currency-search-input"
              placeholder="Search by country, currency or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                type="button"
                className="currency-search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          <div className="currency-options-scroll-list">
            {filteredCurrencies.length === 0 ? (
              <div className="currency-no-results">
                <i className="fa-solid fa-circle-question"></i>
                <span>No currency found.</span>
              </div>
            ) : (
              filteredCurrencies.map((c) => {
                const isSelected = c.code === current.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    className={`currency-option-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(c)}
                  >
                    <div className="currency-item-left">
                      <span className="currency-item-flag">{c.flag}</span>
                      <div className="currency-item-names">
                        <span className="currency-item-country">{c.country}</span>
                        <span className="currency-item-name">{c.name}</span>
                      </div>
                    </div>
                    <div className="currency-item-right">
                      <span className="currency-item-code">{c.code}</span>
                      <span className="currency-item-symbol">{c.symbol}</span>
                      {isSelected && <i className="fa-solid fa-check check-icon"></i>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
