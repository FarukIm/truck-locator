const API_URL = "https://my.api.mockaroo.com/locations.json?key=935e86f0";
const MOBILE_BREAKPOINT = 800;
const DETAILS_TRANSITION_MS = 220;

const state = {
  cardTemplate: null,
  locations: [],
  selectedLocationId: null,
  detailsLocationId: null,
  activeMobileView: "list",
  detailsCloseTimeoutId: null,
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

// Bootstraps the app by caching DOM nodes, wiring events, loading the card template, and fetching locations.
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
  elements.summaryCopy = document.getElementById("summary-copy");
  elements.locationsStatus = document.getElementById("locations-status");
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
}

// Attaches all UI event listeners for list actions, overlay controls, mobile tabs, and responsive layout changes.
function bindEvents() {
  elements.locationsList.addEventListener("click", onLocationListClick);
  elements.locationsList.addEventListener("keydown", onLocationListKeydown);

  elements.mobileTabButtons.forEach((button) => {
    button.addEventListener("click", () => setMobileView(button.dataset.view));
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

  window.addEventListener("resize", syncLayoutMode);
}

// Fetches and compiles the Handlebars card template used to render the location list.
async function loadCardTemplate() {
  const response = await fetch("templates/card.hbs");
  if (!response.ok) {
    throw new Error("Card template request failed.");
  }

  const source = await response.text();
  return Handlebars.compile(source);
}

// Requests location data from the API and updates the summary, list, and map placeholder states.
async function loadLocations() {
  setSummary(
    "Loading taco trucks...",
    "Fetching locations from the locator service.",
  );
  elements.locationsStatus.textContent = "Loading locations…";
  state.selectedLocationId = null;
  updateMapDetailsButtonVisibility();

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Location request failed with ${response.status}.`);
    }

    const payload = await response.json();
    state.locations = Array.isArray(payload)
      ? payload.map(normalizeLocation)
      : [];

    renderSummary();
    renderLocations();

    if (state.locations.length === 0) {
      renderMapPlaceholder("No locations were returned.");
    }
  } catch (error) {
    console.error("Location loading failed.", error);
    state.locations = [];
    state.selectedLocationId = null;
    setSummary(
      "Unable to load taco trucks",
      "The location service could not be reached.",
    );
    elements.locationsStatus.textContent =
      "Unable to load locations right now.";
    renderMapPlaceholder("Map unavailable until a location is loaded.");
  }
}

// Normalizes raw API data into the view model used across cards, map actions, and the details overlay.
function normalizeLocation(location) {
  const hours = getHoursForLocation(location);
  const todayName = getTodayName();
  const todayKey = todayName.toLowerCase();
  const openValue = location[`${todayKey}_open`];
  const closeValue = location[`${todayKey}_close`];
  const isOpenToday = Boolean(openValue && closeValue);
  const phone = location.phone || "N/A";

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

// Builds a weekly hours array for a single location and flags the current day for emphasis in the overlay.
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

// Updates the page headline with the truck count and the dominant postal code from the current dataset.
function renderSummary() {
  const count = state.locations.length;
  const postalCode = getPrimaryPostalCode();
  const headline =
    count === 1 ? "Found 1 Taco Truck" : `Found ${count} Taco Trucks`;

  setSummary(
    `${headline}${postalCode ? ` in ${postalCode}` : ""}`,
    "Choose a location card to load the map and view more details.",
  );
}

// Finds the postal code that appears most often so the summary can mirror the supplied mock headline.
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

// Sets the main headline and subcopy above the locator panels.
function setSummary(title, copy) {
  elements.summaryTitle.textContent = title;
  elements.summaryCopy.textContent = copy;
}

// Renders the list of cards, marking the currently selected location when applicable.
function renderLocations() {
  if (state.locations.length === 0) {
    elements.locationsList.innerHTML = "";
    elements.locationsStatus.textContent = "No locations available.";
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
  elements.locationsStatus.textContent = "";
}

// Handles delegated clicks from the list for card selection, directions, and the more-info action.
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

  const card = event.target.closest(".location-card");
  if (card) {
    selectLocation(getLocationById(card.dataset.locationId));
  }
}

// Lets keyboard users select a focused card with Enter or Space.
function onLocationListKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".location-card");
  if (!card) {
    return;
  }

  event.preventDefault();
  selectLocation(getLocationById(card.dataset.locationId));
}

// Marks a location as selected, re-renders the list state, and loads its map.
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

// Shows a loading state and then asynchronously swaps in a Google Maps iframe for the selected coordinates.
function renderMap(location) {
  if (!location) {
    renderMapPlaceholder("Click a location card to load a map.");
    return;
  }

  elements.mapStage.innerHTML = `
        <div class="map-loading">
            <div class="map-loading__spinner"></div>
            <p>Loading map for ${escapeHtml(location.name)}…</p>
        </div>
    `;

  window.setTimeout(() => {
    elements.mapStage.innerHTML = displayMapLocation(location);
  }, 120);
}

// Replaces the map panel with an empty-state or error message when no map should be shown.
function renderMapPlaceholder(message) {
  elements.mapStage.innerHTML = `
        <div class="map-placeholder">
            <img src="assets/map-pin.png" alt="">
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function updateMapDetailsButtonVisibility() {
  elements.mapDetailsButton.hidden = !Boolean(state.selectedLocationId);
}

function displayMapLocation(location) {
  const latitude = encodeURIComponent(location.latitude);
  const longitude = encodeURIComponent(location.longitude);

  return `
        <iframe
        class="map-image"
        title="${escapeAttribute(`${location.name} map`)}"
        style="border:0"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed">
        </iframe>
    `;
}

// Opens the details overlay, keeps the list/map selection in sync, and renders the expanded location view asynchronously.
function openDetails(location) {
  if (!location) {
    return;
  }

  const isAlreadySelected =
    String(state.selectedLocationId) === String(location.id);

  if (state.detailsCloseTimeoutId) {
    window.clearTimeout(state.detailsCloseTimeoutId);
    state.detailsCloseTimeoutId = null;
  }

  state.detailsLocationId = location.id;
  state.selectedLocationId = location.id;
  renderLocations();
  updateMapDetailsButtonVisibility();
  if (!isAlreadySelected) {
    renderMap(location);
  }

  elements.detailsOverlay.hidden = false;
  elements.detailsOverlay.setAttribute("aria-hidden", "false");
  elements.detailsCard.innerHTML = `
    <div class="details-card__loading">
    <div class="map-loading__spinner"></div>
    <p>Loading full details…</p>
    </div>
  `;
  window.requestAnimationFrame(() => {
    elements.detailsOverlay.classList.add("details-overlay--open");
  });

  if (window.innerWidth < MOBILE_BREAKPOINT) {
    setMobileView("map");
  }

  window.setTimeout(() => {
    if (state.detailsLocationId !== location.id) {
      return;
    }

    elements.detailsCard.innerHTML = buildDetailsMarkup(location);
    elements.detailsCard.focus();

    const previewImage = elements.detailsCard.querySelector(
      ".details-card__preview img",
    );
    if (previewImage) {
      previewImage.src = buildStaticMapUrl(location, 640, 220);
    }
  }, 180);
}

// Resets overlay state and hides the details modal.
function closeDetails() {
  state.detailsLocationId = null;
  elements.detailsOverlay.classList.remove("details-overlay--open");
  elements.detailsOverlay.setAttribute("aria-hidden", "true");

  if (state.detailsCloseTimeoutId) {
    window.clearTimeout(state.detailsCloseTimeoutId);
  }

  state.detailsCloseTimeoutId = window.setTimeout(() => {
    elements.detailsOverlay.hidden = true;
    elements.detailsCard.innerHTML = "";
    state.detailsCloseTimeoutId = null;
  }, DETAILS_TRANSITION_MS);
}

// Returns the markup for the details overlay, including contact actions and the weekly hours grid.
function buildDetailsMarkup(location) {
  const phoneMarkup = location.phone
    ? `
        <a class="details-contact" href="tel:${escapeHtml(location.phone)}">
            <i class="fa-solid fa-square-phone"></i>
            <span>${escapeHtml(location.phone)}</span>
        </a>
    `
    : "";

  return `
        <button class="details-card__close action" type="button">
           <i class="fa-solid fa-x "></i>
        </button>
        <div class="details-card__preview">
            <i class="fa-regular fa-image fa-8x"></i>
        </div>
        <div class="details-card__body">
            <h2>${escapeHtml(location.name)}</h2>
            <address class="details-card__address">
                <span>${escapeHtml(location.address || "")}</span>
                <span>${escapeHtml(`${location.city || ""}, ${location.state || ""} ${location.postal_code || ""}`.trim())}</span>
            </address>
            <div class="details-card__meta">
                ${phoneMarkup}
                <button class="details-link js-details-directions" data-location-id="${location.id}" type="button">
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
            <button class="action-button action-button--full js-full-details" data-url="${escapeAttribute(location.url || "")}" type="button">View Full Details</button>
        </div>
    `;
}

// Handles overlay-level actions such as closing, opening directions, and launching the location URL.
document.addEventListener("click", (event) => {
  const closeButton = event.target.closest(".details-card__close");
  if (closeButton) {
    closeDetails();
    return;
  }

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

// Opens Google Maps directions in a new tab using the selected location address as the destination.
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

// Builds a static map URL for the details preview image.
function buildStaticMapUrl(location, width, height) {
  const latitude = encodeURIComponent(location.latitude);
  const longitude = encodeURIComponent(location.longitude);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=13&size=${width}x${height}&markers=${latitude},${longitude},red-pushpin`;
}

// Toggles the mobile list/map view and keeps the tab button state aligned with the visible panel.
function setMobileView(view) {
  state.activeMobileView = view;

  Object.entries(elements.mobilePanels).forEach(([panelView, panel]) => {
    panel.classList.toggle(
      "mobile-panel--active",
      panelView === view || window.innerWidth >= MOBILE_BREAKPOINT,
    );
  });

  elements.mobileTabButtons.forEach((button) => {
    button.classList.toggle(
      "mobile-tabs__button--active",
      button.dataset.view === view,
    );
  });
}

// Applies the correct panel visibility rules when crossing between desktop and mobile layouts.
function syncLayoutMode() {
  const isDesktop = window.innerWidth >= MOBILE_BREAKPOINT;
  if (isDesktop) {
    elements.mobilePanels.list.classList.add("mobile-panel--active");
    elements.mobilePanels.map.classList.add("mobile-panel--active");
    return;
  }

  setMobileView(state.activeMobileView);
}

// Looks up a location object by id from the in-memory dataset.
function getLocationById(locationId) {
  return (
    state.locations.find(
      (location) => String(location.id) === String(locationId),
    ) || null
  );
}

// Returns the current weekday name so today's hours can be highlighted.
function getTodayName() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    new Date(),
  );
}

// Escapes user-visible strings before inserting them into HTML.
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
