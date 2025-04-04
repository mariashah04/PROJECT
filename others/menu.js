function showPage(pageId, index) {
  const pages = document.querySelectorAll('.page');
  const btnTabs = document.querySelectorAll('.menu-tab');
  pages.forEach(page => {
    page.classList.remove('active');
  });
  btnTabs.forEach((tab, i) => {
    tab.classList.toggle("active", i === index);
  });
  const activePage = document.getElementById(pageId);
  if (activePage) {
    activePage.classList.add('active');
  }
}
function redirect(page){
  console.log('gwdwh')
  setTimeout(function () { window.location = `${page}.html` }, 1);
};
function showTab(tabId, index) {
  const tabs = document.querySelectorAll('.tab');
  const btnTabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.classList.remove('active');
  });

  btnTabs.forEach((tab, i) => {
    tab.classList.toggle("active", i === index);
  });
  const activeTab = document.getElementById(tabId);
  if (activeTab) {
    activeTab.classList.add('active');

  }
}
function handleFileUpload(event, rowId) {
  const fileInput = event.target;
  const file = fileInput.files[0];
  if (file) {
    console.log(`File uploaded in row ${rowId}:`, file.name);
  }
}
function downloadExcel(month) {
  const data = [
      { Name: "John Doe", "Mobile Number": "123-456-7890" },
      { Name: "Jane Smith", "Mobile Number": "987-654-3210" },
      { Name: "Alice Johnson", "Mobile Number": "555-123-4567" },
      { Name: "Bob Lee", "Mobile Number": "555-987-6543" }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contacts");
  const filename = `${month}.xlsx`;
  XLSX.writeFile(wb, filename);
}

