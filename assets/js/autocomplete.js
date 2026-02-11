// src/autocomplete.js

import { appState } from './state.js';

/**
 * Sets up autocomplete functionality for a given input field.
 * @param {HTMLElement} inputElement - The input field for autocomplete.
 * @param {HTMLElement} autocompleteBoxElement - The div to display suggestions.
 */
export function setupAutocomplete(inputElement, autocompleteBoxElement) {
  let timeoutId;
  inputElement.addEventListener('input', () => {
    clearTimeout(timeoutId); // Clear previous timeout
    timeoutId = setTimeout(() => { // Debounce input
      const userInput = inputElement.value.toLowerCase().trim().split(',').pop().trim();
      autocompleteBoxElement.innerHTML = '';
      if (!userInput || !appState.dynamicSkills.length) {
        autocompleteBoxElement.style.display = 'none';
        return;
      }

      const matches = appState.dynamicSkills.filter(skill => skill.includes(userInput)).slice(0, 10);

      if (!matches.length) {
        autocompleteBoxElement.style.display = 'none';
        return;
      }

      matches.forEach(skill => {
        const item = document.createElement('div');
        item.textContent = skill;
        item.setAttribute('role', 'option');
        item.tabIndex = -1;
        item.onclick = () => {
          const parts = inputElement.value.split(',');
          parts.pop();
          parts.push(skill);
          inputElement.value = parts.map(p => p.trim()).join(', ');
          autocompleteBoxElement.innerHTML = '';
          autocompleteBoxElement.style.display = 'none';
          inputElement.focus();
          inputElement.dispatchEvent(new Event("input"));
        };
        autocompleteBoxElement.appendChild(item);
      });

      const rect = inputElement.getBoundingClientRect();
      autocompleteBoxElement.style.left = `${rect.left + window.scrollX}px`;
      autocompleteBoxElement.style.top = `${rect.bottom + window.scrollY}px`;
      autocompleteBoxElement.style.width = `${rect.width}px`;
      autocompleteBoxElement.style.display = 'block';
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!autocompleteBoxElement.contains(e.target) && e.target !== inputElement) {
      autocompleteBoxElement.style.display = 'none';
    }
  });

  inputElement.addEventListener('keydown', (e) => {
    const activeItem = autocompleteBoxElement.querySelector('.autocomplete-active');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeItem) {
        activeItem.classList.remove('autocomplete-active');
        if (activeItem.nextElementSibling) {
          activeItem.nextElementSibling.classList.add('autocomplete-active');
          activeItem.nextElementSibling.focus();
        } else {
          autocompleteBoxElement.firstElementChild.classList.add('autocomplete-active');
          autocompleteBoxElement.firstElementChild.focus();
        }
      } else if (autocompleteBoxElement.firstElementChild) {
        autocompleteBoxElement.firstElementChild.classList.add('autocomplete-active');
        autocompleteBoxElement.firstElementChild.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeItem) {
        activeItem.classList.remove('autocomplete-active');
        if (activeItem.previousElementSibling) {
          activeItem.previousElementSibling.classList.add('autocomplete-active');
          activeItem.previousElementSibling.focus();
        } else {
          autocompleteBoxElement.lastElementChild.classList.add('autocomplete-active');
          autocompleteBoxElement.lastElementChild.focus();
        }
      }
    } else if (e.key === 'Enter') {
      if (activeItem) {
        activeItem.click();
      } else if (inputElement.value.trim()) {
        autocompleteBoxElement.style.display = 'none';
        inputElement.dispatchEvent(new Event("input"));
      }
    } else if (e.key === 'Escape') {
      autocompleteBoxElement.style.display = 'none';
    }
  });
}
