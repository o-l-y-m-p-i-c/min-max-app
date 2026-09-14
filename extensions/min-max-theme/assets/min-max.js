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

  const productForms = () => {
    document.querySelectorAll('form[action*="/cart/add"]').forEach((form) => {
      const variantInput = form.querySelector('input[name="id"], select[name="id"]');
      if (!variantInput) return;
      const variantId = variantInput.value;
      const rule = ruleFor(variantId);
      if (!rule) return;
      let quantityInput = form.querySelector('input[name="quantity"]');
      if (quantityInput) configureInput(quantityInput, variantId, true);
      form.dataset.minMaxVariantId = String(variantId);
    });
  };

  const cartInputs = () => {
    document
      .querySelectorAll("input[data-quantity-variant-id], input[data-cart-item-variant-id]")
      .forEach((input) => {
        const variantId =
          input.dataset.quantityVariantId || input.dataset.cartItemVariantId;
        if (variantId) configureInput(input, variantId, false);
      });
  };

  const apply = () => {
    productForms();
    cartInputs();
  };

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      if (form.matches('form[action*="/cart/add"]')) {
        const variantInput = form.querySelector('input[name="id"], select[name="id"]');
        const variantId = variantInput?.value || form.dataset.minMaxVariantId;
        const rule = variantId ? ruleFor(variantId) : null;
        if (!rule) return;
        let quantityInput = form.querySelector('input[name="quantity"]');
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

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const variantId = input.dataset.minMaxVariantId;
    if (variantId) {
      const rule = ruleFor(variantId);
      if (rule) showMessage(input, rule, !valid(Number(input.value), rule));
    }
    if (input.name === "id" || input.matches('select[name="id"]')) {
      setTimeout(apply, 0);
    }
  });

  let timer;
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(apply, 100);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("shopify:section:load", apply);
  document.addEventListener("cart:updated", apply);
  document.addEventListener("cart:refresh", apply);
})();
