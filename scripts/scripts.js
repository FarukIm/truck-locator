(function () {
  'use strict';

  const API_URL = "https://my.api.mockaroo.com/locations.json?key=935e86f0";
  const MOCK_API_URL = "mock-api-response.json";
  const MOBILE_BREAKPOINT = 768;

  const state = {
    cardTemplate: null,
    locations: [],
    selectedLocationId: null,
    detailsLocationId: null,
    activeMobileView: "list",
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  // Initializes the app
  async function init() {
    cacheElements();
    bindEvents();
    syncLayoutMode();
    updateMapDetailsButtonVisibility();

    try {
      state.cardTemplate = await loadCardTemplate();
    } catch (error) {
      console.error("Template loading failed.", error);
    }

    await loadLocations();
  }

  // Stores frequently used DOM references so the rest of the module avoids repeated queries.
  function cacheElements() {
    elements.summaryTitle = document.getElementById("summary-title");
    elements.locationsStatus = document.getElementById("locations-status");
    elements.locationsError = document.getElementById("locations-error");
    elements.locationsList = document.getElementById("locations-list");
    elements.mapStage = document.getElementById("map-stage");
    elements.detailsOverlay = document.getElementById("details-overlay");
    elements.detailsCard = document.getElementById("details-card");
    elements.mapDetailsButton = document.getElementById("map-details-button");
    elements.mobileTabButtons = Array.from(
      document.querySelectorAll(".mobile-tabs__button"),
    );
    elements.mobilePanels = {
      list: document.getElementById("list-panel"),
      map: document.getElementById("map-panel"),
    };
    elements.detailsModal = bootstrap.Modal.getOrCreateInstance(
      elements.detailsOverlay,
      {
        backdrop: false,
        focus: true,
      },
    );
  }

  // Attaches all UI event listeners for list actions, overlay controls, mobile tabs, and responsive layout changes.
  function bindEvents() {
    elements.locationsList.addEventListener("click", onLocationListClick);
    elements.locationsList.addEventListener("keydown", onLocationListKeydown);

    elements.mobileTabButtons.forEach((button) => {
      button.addEventListener("click", () =>
        setMobileView(button.dataset.view),
      );
    });

    elements.detailsOverlay.addEventListener("click", (event) => {
      if (event.target === elements.detailsOverlay) {
        closeDetails();
      }
    });

    elements.mapDetailsButton.addEventListener("click", () => {
      openDetails(getLocationById(state.selectedLocationId));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDetails();
      }
    });

    elements.detailsOverlay.addEventListener("hidden.bs.modal", () => {
      state.detailsLocationId = null;
      elements.detailsCard.innerHTML = "";
      updateMapDetailsButtonVisibility();
    });

    window.addEventListener("resize", syncLayoutMode);
  }

  // Fetches and compiles the Handlebars card template used to render the location list
  async function loadCardTemplate() {
    const response = await fetch("templates/card.hbs");
    if (!response.ok) {
      throw new Error("Card template request failed.");
    }

    const source = await response.text();
    return Handlebars.compile(source);
  }

  // Gets location data from, applies api mock data if api fails
  async function loadLocations() {
    setSummary("Loading taco trucks...");
    setLocationsError("");
    setLocationsStatus("Loading locations...", true);
    state.selectedLocationId = null;
    updateMapDetailsButtonVisibility();

    try {
      const payload = await fetchLocationsFrom(API_URL);
      setLocationsError("");
      applyLocationsPayload(payload);
    } catch (error) {
      console.error("Location loading failed.", error);
      try {
        const fallbackPayload = await fetchLocationsFrom(MOCK_API_URL);
        applyLocationsPayload(fallbackPayload);
        setSummary("Using mock data, API fail");
        setLocationsError("Using mock data, API fail");
      } catch (fallbackError) {
        console.error("Mock fallback loading failed.", fallbackError);
        setSummary("Unable to load locations.");
        setLocationsError("Unable to load locations.");
        state.locations = [];
        state.selectedLocationId = null;
        renderSummary();
        renderLocations();
        renderMapPlaceholder("Map unavailable until a location is loaded.");
      }
    }
  }

  // Fetch helper
  async function fetchLocationsFrom(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Location request failed with ${response.status}.`);
    }

    return response.json();
  }

  // Updates locations and re-renders components
  function applyLocationsPayload(payload) {
    state.locations = Array.isArray(payload)
      ? payload.map(normalizeLocation)
      : [];
    renderSummary();
    renderLocations();

    if (state.locations.length === 0) {
      renderMapPlaceholder("No locations were returned.");
    }
  }

  // Normalizes API data into a more usable format
  function normalizeLocation(location) {
    const hours = getHoursForLocation(location);
    const todayName = getTodayName();
    const todayKey = todayName.toLowerCase();
    const openValue = location[`${todayKey}_open`];
    const closeValue = location[`${todayKey}_close`];
    const isOpenToday = Boolean(openValue && closeValue);
    const phone = location.phone || "";

    return {
      ...location,
      phone,
      distance: location.distance || location.miles || "",
      fullAddress: [
        location.address,
        `${location.city}, ${location.state} ${location.postal_code}`,
      ]
        .filter(Boolean)
        .join(", "),
      hours,
      isOpenToday,
      todaySummary: isOpenToday
        ? `Open today until ${closeValue}`
        : "Closed today",
    };
  }

  // Builds a weekly hours array for a single location and flags the current day for emphasis
  function getHoursForLocation(location) {
    const days = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    return days.map((day) => {
      const key = day.toLowerCase();
      const open = location[`${key}_open`];
      const close = location[`${key}_close`];
      const label = open && close ? `${open} - ${close}` : "Closed";

      return {
        day,
        label,
        isToday: day === getTodayName(),
      };
    });
  }

  // Updates the page headline with the truck count and the dominant postal code from the current dataset
  function renderSummary() {
    const count = state.locations.length;
    const postalCode = getPrimaryPostalCode();
    const headline =
      count === 1 ? "Found 1 Taco Truck" : `Found ${count} Taco Trucks`;

    setSummary(`${headline}${postalCode ? ` in ${postalCode}` : ""}`);
  }

  // Finds the postal code that appears most often for header
  function getPrimaryPostalCode() {
    const counts = new Map();

    state.locations.forEach((location) => {
      if (!location.postal_code) {
        return;
      }

      counts.set(
        location.postal_code,
        (counts.get(location.postal_code) || 0) + 1,
      );
    });

    let selectedCode = "";
    let selectedCount = 0;

    counts.forEach((count, postalCode) => {
      if (count > selectedCount) {
        selectedCode = postalCode;
        selectedCount = count;
      }
    });

    return selectedCode;
  }

  // Sets the main header
  function setSummary(title) {
    elements.summaryTitle.textContent = title;
  }

  // Renders the list of cards, marking the currently selected location when applicable
  function renderLocations() {
    if (state.locations.length === 0) {
      elements.locationsList.innerHTML = "";
      setLocationsStatus("No locations available.");
      return;
    }

    const viewModel = {
      locations: state.locations.map((location) => ({
        ...location,
        isSelected: location.id === state.selectedLocationId,
      })),
    };

    const markup = state.cardTemplate(viewModel);
    elements.locationsList.innerHTML = markup;
    setLocationsStatus("");
  }

  // Loading spinner for fetching locations
  function setLocationsStatus(message, isLoading = false) {
    const centeredClasses = [
      "d-flex",
      "flex-column",
      "align-items-center",
      "justify-content-center",
      "h-100",
    ];

    elements.locationsStatus.classList.remove("locations-status--loading");
    elements.locationsStatus.classList.remove(...centeredClasses);

    if (!message) {
      elements.locationsStatus.innerHTML = "";
      elements.locationsStatus.classList.add("d-none");
      elements.locationsList.classList.remove("d-none");
      return;
    }

    elements.locationsStatus.classList.remove("d-none");

    if (isLoading) {
      elements.locationsStatus.classList.add("locations-status--loading");
      elements.locationsStatus.innerHTML = `
      <div class="map-loading__spinner" aria-hidden="true"></div>
      <p class="mb-0">${escapeHtml(message)}</p>
    `;
      elements.locationsList.classList.add("d-none");
      return;
    }

    elements.locationsStatus.textContent = message;
    elements.locationsStatus.classList.add(...centeredClasses);
    elements.locationsList.classList.add("d-none");
  }

  // Error message for for mobile
  function setLocationsError(message) {
    if (!message) {
      elements.locationsError.textContent = "";
      elements.locationsError.classList.add("d-none");
      return;
    }

    elements.locationsError.textContent = message;
    elements.locationsError.classList.remove("d-none");
  }

  // Handles delegated clicks from the list for card actions
  function onLocationListClick(event) {
    const directionsButton = event.target.closest(".js-directions");
    if (directionsButton) {
      event.stopPropagation();
      openDirections(getLocationById(directionsButton.dataset.locationId));
      return;
    }

    const moreInfoButton = event.target.closest(".js-more-info");
    if (moreInfoButton) {
      event.stopPropagation();
      openDetails(getLocationById(moreInfoButton.dataset.locationId));
      return;
    }

    const card = event.target.closest(".js-location-card");
    if (card) {
      selectLocation(getLocationById(card.dataset.locationId));
    }
  }

  // Lets keyboard users select a focused card with Enter or Space
  function onLocationListKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const card = event.target.closest(".js-location-card");
    if (!card) {
      return;
    }

    event.preventDefault();
    selectLocation(getLocationById(card.dataset.locationId));
  }

  // Marks a location as selected, re-renders the list state, and loads its map
  function selectLocation(location) {
    if (!location) {
      return;
    }

    state.selectedLocationId = location.id;
    closeDetails();
    updateMapDetailsButtonVisibility();
    renderLocations();
    renderMap(location);

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setMobileView("map");
    }
  }

  // Shows a loading state and then shows map
  function renderMap(location) {
    if (!location) {
      renderMapPlaceholder("Click a location card to load a map.");
      return;
    }

    elements.mapStage.innerHTML = `
        <div class="map-loading d-flex flex-column align-items-center justify-content-center gap-3 h-100 p-4 text-center">
            <div class="map-loading__spinner"></div>
            <p>Loading map for ${escapeHtml(location.name)}...</p>
        </div>
    `;

    window.setTimeout(() => {
      elements.mapStage.innerHTML = displayMapLocation(location);
    }, 120);
  }

  // Replaces the map panel with an empty-state or error message when no map should be shown.
  function renderMapPlaceholder(message) {
    elements.mapStage.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center gap-3 h-100 p-4 text-center">
            <p>${escapeHtml(message)}</p>
        </div>
    `;
  }

  function updateMapDetailsButtonVisibility() {
    const shouldShow =
      Boolean(state.selectedLocationId) &&
      window.innerWidth < MOBILE_BREAKPOINT &&
      state.activeMobileView === "map" &&
      state.detailsLocationId === null;

    elements.mapDetailsButton.hidden = !shouldShow;
  }

  // Displays the map for a given location
  function displayMapLocation(location) {
    const latitude = encodeURIComponent(location.latitude);
    const longitude = encodeURIComponent(location.longitude);

    return `
        <iframe
        class="h-100 w-100 cover"
        title="${escapeAttribute(`${location.name} map`)}"
        style="border:0"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed">
        </iframe>
    `;
  }

  // Opens the details modal
  function openDetails(location) {
    if (!location) {
      return;
    }

    const isAlreadySelected =
      String(state.selectedLocationId) === String(location.id);

    state.detailsLocationId = location.id;
    state.selectedLocationId = location.id;
    renderLocations();
    updateMapDetailsButtonVisibility();
    if (!isAlreadySelected) {
      renderMap(location);
    }

    elements.detailsCard.innerHTML = `
    <div class="modal-content">
      <div class="modal-body w-100 details-card__loading d-flex flex-column align-items-center justify-content-center gap-3 h-100 p-4 text-center">
        <div class="map-loading__spinner"></div>
        <p class="mb-0">Loading full details...</p>
      </div>
    </div>
  `;
    elements.detailsModal.show();

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setMobileView("map");
    }

    if (state.detailsLocationId !== location.id) {
      return;
    }

    elements.detailsCard.innerHTML = buildDetailsMarkup(location);
    elements.detailsCard.focus();
  }

  // Close details modal
  function closeDetails() {
    elements.detailsModal.hide();
  }

  // Markup for details modal
  function buildDetailsMarkup(location) {
    const phoneMarkup = location.phone
      ? `
        <a class="btn btn-secondary btn-sm p-0" href="tel:${escapeHtml(location.phone)}">
            <i class="fa-solid fa-square-phone"></i>
            <span>${escapeHtml(location.phone)}</span>
        </a>
    `
      : "";

    return `
    <div class="modal-content border-0 shadow">
      <div class="modal-header border-0 pb-0">
      <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body pt-1">
      <div class="details-card__preview d-flex align-items-center justify-content-center">
        <i class="fa-regular fa-image fa-7x" style="color: #eeeeee;"></i>
      </div>
      <h2 class="fs-3 fw-normal my-2" id="details-title">${escapeHtml(location.name)}</h2>
        <address class="d-flex flex-column mb-1 mb-md-2">
          <span>${escapeHtml(location.address || "")}</span>
          <span>${escapeHtml(`${location.city || ""}, ${location.state || ""} ${location.postal_code || ""}`.trim())}</span>
        </address>
        <div class="d-flex flex-wrap align-items-center justify-content-start gap-3 mb-1 md-mb-2">
          ${phoneMarkup}
          <button class="btn btn-secondary p-0 btn-sm js-details-directions" data-location-id="${location.id}" type="button">
            <i class="fa-solid fa-car"></i>
            <span>Get Directions</span>
          </button>
        </div>
        <div class="hours-list">
          ${location.hours
            .map(
              (entry) => `
                <div class="hours-row ${entry.isToday ? "hours-row--today" : ""}">
                  <span>${escapeHtml(entry.day)}</span>
                  <span>${escapeHtml(entry.label)}</span>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="modal-footer border-0 pt-0">
        <button class="btn btn-primary w-100 js-full-details" data-url="${escapeAttribute(location.url || "")}" type="button">View Full Details</button>
      </div>
    </div>
    `;
  }

  // Handles click events on the details modal
  document.addEventListener("click", (event) => {
    const directionsButton = event.target.closest(".js-details-directions");
    if (directionsButton) {
      openDirections(getLocationById(directionsButton.dataset.locationId));
      return;
    }

    const fullDetailsButton = event.target.closest(".js-full-details");
    if (fullDetailsButton) {
      const url = fullDetailsButton.dataset.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  });

  // Opens Google Maps directions in a new tab using the selected location coordinates
  function openDirections(location) {
    if (!location) {
      return;
    }

    const lat = location.latitude;
    const lng = location.longitude;
    const destination = `${lat},${lng}`;
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${destination}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  // Toggles the mobile list/map view and keeps the tab button state aligned with the visible panel
  function setMobileView(view) {
    state.activeMobileView = view;
    const isDesktop = window.innerWidth >= MOBILE_BREAKPOINT;

    Object.entries(elements.mobilePanels).forEach(([panelView, panel]) => {
      const isVisible = isDesktop || panelView === view;
      panel.classList.toggle("d-none", !isVisible);
      panel.classList.toggle("d-block", isVisible);
    });

    elements.mobileTabButtons.forEach((button) => {
      const isActive = button.dataset.view === view;
      button.classList.toggle("mobile-tabs__button--active", isActive);
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    });

    updateMapDetailsButtonVisibility();
  }

  // Applies the correct panel visibility rules when crossing between desktop and mobile layouts
  function syncLayoutMode() {
    const isDesktop = window.innerWidth >= MOBILE_BREAKPOINT;
    if (!isDesktop) {
      setMobileView(state.activeMobileView);
      return;
    }
    elements.mobilePanels.list.classList.remove("d-none");
    elements.mobilePanels.map.classList.remove("d-none");
    elements.mobilePanels.list.classList.add("d-block");
    elements.mobilePanels.map.classList.add("d-block");
    elements.mobileTabButtons.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.view === state.activeMobileView,
      );
      button.classList.toggle(
        "mobile-tabs__button--active",
        button.dataset.view === state.activeMobileView,
      );
      button.setAttribute(
        "aria-current",
        button.dataset.view === state.activeMobileView ? "page" : "false",
      );
    });
    updateMapDetailsButtonVisibility();
  }

  // Looks up a location object by id
  function getLocationById(locationId) {
    return (
      state.locations.find(
        (location) => String(location.id) === String(locationId),
      ) || null
    );
  }

  // Returns the current weekday name so today's hours can be highlighted
  function getTodayName() {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
      new Date(),
    );
  }

  // Escapes user-visible strings before inserting them into HTML
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // Escapes values that will be inserted into HTML attributes.
  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
