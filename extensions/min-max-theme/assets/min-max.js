(() => {
  if (window.__minMaxQuantityControls) return;
  window.__minMaxQuantityControls = true;

  const configNode = document.querySelector("[data-min-max-configuration]");
  if (!configNode) return;

  let config;
  try {
    config = JSON.parse(configNode.textContent || "{}");
    if (typeof config === "string") config = JSON.parse(config);
  } catch {
    return;
  }
  if (!config?.enabled || !config.rules) return;

  const rules = config.rules;
  const locale = (document.documentElement.lang || "en").toLowerCase().split("-")[0];

  const ruleFor = (variantId) => {
    if (!variantId) return null;
    const id = String(variantId).split("/").pop();
    return rules[id] || null;
  };

  const valid = (quantity, rule) =>
    Number.isInteger(quantity) &&
    quantity >= rule.minimum &&
    (rule.maximum == null || quantity <= rule.maximum) &&
    quantity % rule.increment === 0;

  const message = (rule, isError = false) => {
    if (isError && rule.customMessages?.[locale]) return rule.customMessages[locale];
    const parts = [`Minimum ${rule.minimum}`, `multiples of ${rule.increment}`];
    if (rule.maximum != null) parts.push(`maximum ${rule.maximum}`);
    return parts.join(" · ");
  };

  const showMessage = (input, rule, isError = false) => {
    const host = input.closest("quantity-input, .quantity, .product-form__quantity, .cart-item__quantity") || input.parentElement;
    if (!host) return;
    let node = host.parentElement?.querySelector(":scope > [data-min-max-message]");
    if (!node) {
      node = document.createElement("span");
      node.dataset.minMaxMessage = "true";
      host.insertAdjacentElement("afterend", node);
    }
    node.className = `min-max-message${isError ? " min-max-message--error" : ""}`;
    node.textContent = message(rule, isError);
    input.classList.toggle("min-max-invalid", isError);
    input.setAttribute("aria-invalid", String(isError));
  };

  const snapToValid = (quantity, rule) => {
    if (!Number.isFinite(quantity)) return rule.start;
    if (quantity < rule.minimum) return rule.start;
    if (rule.maximum != null && quantity > rule.maximum) return rule.maximum;
    const remainder = quantity % rule.increment;
    if (remainder === 0) return quantity;
    const snapped = quantity - remainder;
    return snapped >= rule.minimum ? snapped : rule.start;
  };

  const setValue = (input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const configureInput = (input, variantId, initialize) => {
    const rule = ruleFor(variantId);
    if (!rule) return;
    input.min = String(rule.minimum);
    input.step = String(rule.increment);
    if (rule.maximum != null) input.max = String(rule.maximum);
    else input.removeAttribute("max");
    input.dataset.minMaxVariantId = String(variantId);
    if (initialize) {
      const quantity = Number(input.value);
      if (!valid(quantity, rule)) setValue(input, rule.start);
    }
    showMessage(input, rule, !valid(Number(input.value), rule));
  };

  // Find the variant ID for a given quantity input by looking at:
  // 1. data-quantity-variant-id / data-cart-item-variant-id (cart)
  // 2. The form it belongs to (via form attribute or closest form)
  const variantIdForInput = (input) => {
    if (input.dataset.quantityVariantId) return input.dataset.quantityVariantId;
    if (input.dataset.cartItemVariantId) return input.dataset.cartItemVariantId;
    if (input.dataset.minMaxVariantId) return input.dataset.minMaxVariantId;
    const formId = input.getAttribute("form");
    const form = formId
      ? document.getElementById(formId)
      : input.closest("form");
    if (!form) return null;
    const variantInput = form.querySelector('input[name="id"], select[name="id"]');
    return variantInput?.value || form.dataset.minMaxVariantId || null;
  };

  // Configure ALL quantity inputs on the page — product forms, cart, etc.
  const apply = () => {
    // Product page: inputs with name="quantity" linked to /cart/add forms
    document.querySelectorAll('input[name="quantity"]').forEach((input) => {
      const variantId = variantIdForInput(input);
      const rule = ruleFor(variantId);
      if (!rule) return;
      // Only initialize (set start value) on product pages, not cart
      const isProductForm = input.getAttribute("form") || input.closest('form[action*="/cart/add"]');
      configureInput(input, variantId, Boolean(isProductForm));
    });

    // Cart page: inputs with data-quantity-variant-id or data-cart-item-variant-id
    document
      .querySelectorAll("input[data-quantity-variant-id], input[data-cart-item-variant-id]")
      .forEach((input) => {
        const variantId = input.dataset.quantityVariantId || input.dataset.cartItemVariantId;
        if (variantId) configureInput(input, variantId, false);
      });

    // Mark all /cart/add forms with their variant ID for the submit handler
    document.querySelectorAll('form[action*="/cart/add"]').forEach((form) => {
      const variantInput = form.querySelector('input[name="id"], select[name="id"]');
      if (variantInput) form.dataset.minMaxVariantId = String(variantInput.value);
    });
  };

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      if (form.matches('form[action*="/cart/add"]')) {
        const variantInput = form.querySelector('input[name="id"], select[name="id"]');
        const variantId = variantInput?.value || form.dataset.minMaxVariantId;
        const rule = ruleFor(variantId);
        if (!rule) return;
        // Find the quantity input — inside the form or linked via form attribute
        let quantityInput = form.querySelector('input[name="quantity"]');
        if (!quantityInput && form.id) {
          quantityInput = document.querySelector(`input[name="quantity"][form="${form.id}"]`);
        }
        if (!quantityInput) {
          quantityInput = document.createElement("input");
          quantityInput.type = "hidden";
          quantityInput.name = "quantity";
          quantityInput.value = String(rule.start);
          form.appendChild(quantityInput);
        }
        if (!valid(Number(quantityInput.value), rule)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          showMessage(quantityInput, rule, true);
        }
        return;
      }

      const submitter = event.submitter;
      const isCheckout =
        submitter?.name === "checkout" ||
        submitter?.id?.toLowerCase().includes("checkout");
      if (!isCheckout) return;
      const invalid = [...document.querySelectorAll("input[data-min-max-variant-id]")].find(
        (input) => {
          const rule = ruleFor(input.dataset.minMaxVariantId);
          return rule && !valid(Number(input.value), rule);
        },
      );
      if (invalid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const rule = ruleFor(invalid.dataset.minMaxVariantId);
        showMessage(invalid, rule, true);
        invalid.focus();
      }
    },
    true,
  );

  // Snap invalid values on change and blur
  const handleInputCorrection = (input) => {
    const variantId = input.dataset.minMaxVariantId;
    if (!variantId) return;
    const rule = ruleFor(variantId);
    if (!rule) return;
    let quantity = Number(input.value);
    if (!valid(quantity, rule)) {
      const snapped = snapToValid(quantity, rule);
      setValue(input, snapped);
      quantity = snapped;
    }
    showMessage(input, rule, !valid(quantity, rule));
  };

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name === "quantity" || input.dataset.minMaxVariantId) {
      handleInputCorrection(input);
    }
    // Variant changed — re-apply to pick up new variant's rule
    if (input.name === "id" || input.matches('select[name="id"]')) {
      setTimeout(apply, 0);
    }
  });

  document.addEventListener("blur", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name === "quantity" || input.dataset.minMaxVariantId) {
      handleInputCorrection(input);
    }
  }, true);

  let timer;
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(apply, 100);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(apply, 100), { once: true });
  } else {
    setTimeout(apply, 100);
  }
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("shopify:section:load", () => setTimeout(apply, 100));
  document.addEventListener("cart:updated", () => setTimeout(apply, 100));
  document.addEventListener("cart:refresh", () => setTimeout(apply, 100));
})();
