// VC/PE Automation Tools Main Functionality
// Data is loaded from automation-data.js
let automations = [];

// Cart functionality
let cart = [];

// DOM elements
let searchInput, categoryFilter, departmentFilter, automationsGrid, cartToggle, cartSidebar, cartOverlay, cartItems, cartCount, cartTotal, exportFromCart, resultCount, noResults, closeCart, totalCount, totalAutomations;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  // Load automation data from external file
  if (window.automationData) {
    automations = window.automationData;
    console.log('Loaded', automations.length, 'automation templates');
  } else {
    console.error('Automation data not found!');
  }
  
  initializeElements();
  updateTotalCounts();
  populateFilters();
  renderAutomations(automations);
  setupEventListeners();
});

function initializeElements() {
  searchInput = document.getElementById('searchInput');
  categoryFilter = document.getElementById('categoryFilter');
  departmentFilter = document.getElementById('departmentFilter');
  automationsGrid = document.getElementById('automationsGrid');
  cartToggle = document.getElementById('cartToggle');
  cartSidebar = document.getElementById('cartSidebar');
  cartOverlay = document.getElementById('cartOverlay');
  cartItems = document.getElementById('cartItems');
  cartCount = document.getElementById('cartCount');
  cartTotal = document.getElementById('cartTotal');
  exportFromCart = document.getElementById('exportFromCart');
  resultCount = document.getElementById('resultCount');
  noResults = document.getElementById('noResults');
  closeCart = document.getElementById('closeCart');
  totalCount = document.getElementById('totalCount');
  totalAutomations = document.getElementById('totalAutomations');
}

function updateTotalCounts() {
  if (totalCount) {
    totalCount.textContent = automations.length;
  }
  if (totalAutomations) {
    totalAutomations.textContent = automations.length;
  }
}

function populateFilters() {
  // Get unique categories and departments
  const categories = [...new Set(automations.map(a => a.category))].sort();
  const departments = [...new Set(automations.map(a => a.department))].sort();
  
  // Populate category filter
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
  
  // Populate department filter
  departments.forEach(department => {
    const option = document.createElement('option');
    option.value = department;
    option.textContent = department;
    departmentFilter.appendChild(option);
  });
}

function renderAutomations(automationsToRender) {
  automationsGrid.innerHTML = '';
  
  if (automationsToRender.length === 0) {
    noResults.classList.remove('hidden');
    resultCount.textContent = '0';
    return;
  }
  
  noResults.classList.add('hidden');
  resultCount.textContent = automationsToRender.length;
  
  automationsToRender.forEach((automation, index) => {
    const originalIndex = automations.findIndex(a => a.title === automation.title);
    const card = createAutomationCard(automation, originalIndex);
    automationsGrid.appendChild(card);
  });
}

function createAutomationCard(automation, index) {
  const isInCart = cart.some(item => item.title === automation.title);
  
  const card = document.createElement('div');
  card.className = 'bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border';
  
  card.innerHTML = `
    <div class="p-6">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <span class="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full mb-2">
            ${automation.category}
          </span>
          <h3 class="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
            ${automation.title}
          </h3>
        </div>
        <button 
          class="add-to-cart-btn ml-2 p-2 rounded-full transition-colors duration-200 ${isInCart ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600'}"
          data-index="${index}"
          ${isInCart ? 'disabled' : ''}
        >
          <i class="fas ${isInCart ? 'fa-check' : 'fa-plus'} text-sm"></i>
        </button>
      </div>
      
      <p class="text-gray-600 text-sm mb-4 line-clamp-3">
        ${automation.description}
      </p>
      
      <div class="flex items-center justify-between">
        <span class="inline-block px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
          ${automation.department}
        </span>
      </div>
    </div>
  `;
  
  return card;
}

function setupEventListeners() {
  // Search and filter
  searchInput.addEventListener('input', filterAutomations);
  categoryFilter.addEventListener('change', filterAutomations);
  departmentFilter.addEventListener('change', filterAutomations);
  
  // Cart functionality
  cartToggle.addEventListener('click', toggleCart);
  closeCart.addEventListener('click', toggleCart);
  cartOverlay.addEventListener('click', toggleCart);
  exportFromCart.addEventListener('click', exportSelected);
  
  // Add to cart buttons
  automationsGrid.addEventListener('click', function(e) {
    if (e.target.closest('.add-to-cart-btn')) {
      const btn = e.target.closest('.add-to-cart-btn');
      const index = parseInt(btn.dataset.index);
      if (index >= 0 && index < automations.length) {
        addToCart(automations[index]);
      }
    }
  });
}

function filterAutomations() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedCategory = categoryFilter.value;
  const selectedDepartment = departmentFilter.value;
  
  const filtered = automations.filter(automation => {
    const matchesSearch = automation.title.toLowerCase().includes(searchTerm) ||
                         automation.description.toLowerCase().includes(searchTerm);
    const matchesCategory = !selectedCategory || automation.category === selectedCategory;
    const matchesDepartment = !selectedDepartment || automation.department === selectedDepartment;
    
    return matchesSearch && matchesCategory && matchesDepartment;
  });
  
  renderAutomations(filtered);
}

function addToCart(automation) {
  if (!cart.some(item => item.title === automation.title)) {
    cart.push(automation);
    updateCartUI();
    renderAutomations(getCurrentFilteredAutomations());
  }
}

function removeFromCart(title) {
  cart = cart.filter(item => item.title !== title);
  updateCartUI();
  renderAutomations(getCurrentFilteredAutomations());
}

function updateCartUI() {
  cartCount.textContent = cart.length;
  cartTotal.textContent = cart.length;
  
  exportFromCart.disabled = cart.length === 0;
  
  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="text-gray-500">No automations selected</p>';
  } else {
    cartItems.innerHTML = cart.map(item => `
      <div class="border-b pb-4 mb-4 last:border-b-0">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h4 class="font-medium text-sm mb-1">${item.title}</h4>
            <div class="flex gap-2 mb-2">
              <span class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">${item.category}</span>
              <span class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">${item.department}</span>
            </div>
          </div>
          <button class="text-red-500 hover:text-red-700 ml-2" onclick="removeFromCart('${item.title}')">
            <i class="fas fa-trash text-sm"></i>
          </button>
        </div>
      </div>
    `).join('');
  }
}

function getCurrentFilteredAutomations() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedCategory = categoryFilter.value;
  const selectedDepartment = departmentFilter.value;
  
  return automations.filter(automation => {
    const matchesSearch = automation.title.toLowerCase().includes(searchTerm) ||
                         automation.description.toLowerCase().includes(searchTerm);
    const matchesCategory = !selectedCategory || automation.category === selectedCategory;
    const matchesDepartment = !selectedDepartment || automation.department === selectedDepartment;
    
    return matchesSearch && matchesCategory && matchesDepartment;
  });
}

function toggleCart() {
  const isOpen = !cartSidebar.classList.contains('translate-x-full');
  
  if (isOpen) {
    cartSidebar.classList.add('translate-x-full');
    cartOverlay.classList.add('hidden');
  } else {
    cartSidebar.classList.remove('translate-x-full');
    cartOverlay.classList.remove('hidden');
  }
}

function exportSelected() {
  if (cart.length === 0) return;
  
  // Show iframe first
  showExportIframe();
}

function showExportIframe() {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-semibold">Export Automation Templates</h3>
        <button id="closeExportModal" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <div class="mb-6">
        <iframe src="https://abhishek.parolkar.com/embed?minimal=true&vertical=true" 
                width="480" height="90" 
                style="border:1px solid #EEE; background:white; width: 100%; max-width: 480px;" 
                frameborder="0" scrolling="no">
        </iframe>
      </div>
      
      <button id="downloadExport" class="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg">
        <i class="fas fa-download mr-2"></i>
        Download JSON Export (${cart.length} templates)
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners
  document.getElementById('closeExportModal').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  document.getElementById('downloadExport').addEventListener('click', () => {
    downloadExportFile();
    document.body.removeChild(modal);
  });
  
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function downloadExportFile() {
  const exportData = {
    exportDate: new Date().toISOString(),
    totalAutomations: cart.length,
    automations: cart.map(item => ({
      title: item.title,
      description: item.description,
      department: item.department,
      category: item.category,
      templateLink: item.link
    }))
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vc-pe-automations-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// CSS for line clamping
const style = document.createElement('style');
style.textContent = `
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`;
document.head.appendChild(style);
