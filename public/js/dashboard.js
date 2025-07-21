$(document).ready(function() {
    let statusCheckInterval = null;
    let currentStatus = 'disconnected';

    // Initialize dashboard
    initializeDashboard();

    function initializeDashboard() {
        setupNavigation();
        setupEventListeners();
        checkConnectionStatus();
        startStatusPolling();
        
        // Load data transaksi saat pertama kali dibuka
        loadTransactionsFromDatabase();
    }

    function setupNavigation() {
        $('.nav-link').on('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all nav links and sections
            $('.nav-link').removeClass('active');
            $('.content-section').removeClass('active');
            
            // Add active class to clicked nav link
            $(this).addClass('active');
            
            // Show corresponding section
            const section = $(this).data('section');
            $(`#${section}-section`).addClass('active');
            
            // Load section-specific data
            loadSectionData(section);
        });
    }

    function setupEventListeners() {
        // Connection controls
        $('#connect-btn').on('click', connectToWhatsApp);
        $('#disconnect-btn').on('click', disconnectFromWhatsApp);
        $('#clear-session-btn').on('click', clearSession);
        
        // Jabber controls
        $('#jabber-connect-btn').on('click', connectToJabber);
        $('#jabber-disconnect-btn').on('click', disconnectFromJabber);
        $('#jabber-test-btn').on('click', testJabberConnection);
        $('#jabber-clear-config-btn').on('click', clearJabberConfig);
        $('#jabber-send-transaction-btn').on('click', sendTransactionViaJabber);
        $('#jabber-load-from-table-btn').on('click', loadTransactionFromTable);
        
        // Transaksi controls
        $('#import-excel-btn').on('click', triggerFileInput);
        $('#excel-file').on('change', handleFileImport);
        $('#clear-data-btn').on('click', clearTransaksiData);
        
        // Send method change handler
        $('#send-method').on('change', handleSendMethodChange);
        
        // Send configuration listeners
        $('#send-count, #target-number, #send-delay').on('input change', updateSendInfo);
    }

    function loadSectionData(section) {
        switch(section) {
            case 'transaksi':
                loadTransaksiData();
                // Initialize send method selection
                handleSendMethodChange();
                break;
            case 'connection':
                // Connection section doesn't need additional data loading
                break;
            case 'jabber':
                checkJabberStatus();
                break;
                break;
            case 'jabber':
                checkJabberStatus();
                break;
        }
    }

    function startStatusPolling() {
        statusCheckInterval = setInterval(checkConnectionStatus, 3000);
    }

    function stopStatusPolling() {
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    }

    async function checkConnectionStatus() {
        try {
            const response = await $.get('/api/status');
            updateConnectionStatus(response.status);
            
            if (response.qrCode) {
                showQRCode(response.qrCode);
            } else {
                hideQRCode();
            }
            
            if (response.status === 'connected') {
                showConnectionSuccess();
            }
        } catch (error) {
            console.error('Error checking status:', error);
            showToast('Error checking connection status', 'error');
        }
    }

    function updateConnectionStatus(status) {
        currentStatus = status;
        const statusElement = $('#connection-status');
        
        statusElement.removeClass('connected disconnected connecting');
        statusElement.addClass(status);
        
        switch(status) {
            case 'connected':
                statusElement.text('Connected');
                $('#connect-btn').prop('disabled', true);
                $('#disconnect-btn').prop('disabled', false);
                break;
            case 'connecting':
                statusElement.text('Connecting');
                $('#connect-btn').prop('disabled', true);
                $('#disconnect-btn').prop('disabled', false);
                break;
            default:
                statusElement.text('Disconnected');
                $('#connect-btn').prop('disabled', false);
                $('#disconnect-btn').prop('disabled', true);
        }
    }

    async function connectToWhatsApp() {
        try {
            showLoading();
            updateConnectionStatus('connecting');
            showToast('Initiating WhatsApp connection...', 'info');
            
            const response = await $.post('/api/connect');
            
            if (response.success) {
                showToast('Connection initiated. Please wait for QR code...', 'success');
                // Start checking for QR code
                startQRPolling();
            } else {
                showToast(response.message || 'Failed to connect', 'error');
                updateConnectionStatus('disconnected');
            }
        } catch (error) {
            console.error('Error connecting:', error);
            showToast('Error connecting to WhatsApp', 'error');
            updateConnectionStatus('disconnected');
        } finally {
            hideLoading();
        }
    }

    function startQRPolling() {
        // Show loading indicator
        $('#qr-loading').show();
        $('#qr-code').empty();
        
        // Poll more frequently when waiting for QR
        const qrInterval = setInterval(async () => {
            try {
                const response = await $.get('/api/status');
                if (response.qrCode) {
                    $('#qr-loading').hide();
                    showQRCode(response.qrCode);
                    clearInterval(qrInterval);
                } else if (response.status === 'connected') {
                    $('#qr-loading').hide();
                    clearInterval(qrInterval);
                } else if (response.status === 'disconnected') {
                    $('#qr-loading').hide();
                    clearInterval(qrInterval);
                }
            } catch (error) {
                console.error('Error polling QR status:', error);
                $('#qr-loading').hide();
                clearInterval(qrInterval);
            }
        }, 1000); // Check every second for QR
        
        // Stop polling after 60 seconds
        setTimeout(() => {
            $('#qr-loading').hide();
            clearInterval(qrInterval);
        }, 60000);
    }

    async function disconnectFromWhatsApp() {
        try {
            showLoading();
            
            const response = await $.post('/api/disconnect');
            
            if (response.success) {
                showToast('Disconnected successfully', 'success');
                updateConnectionStatus('disconnected');
                hideQRCode();
                hideConnectionSuccess();
            } else {
                showToast(response.message || 'Failed to disconnect', 'error');
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
            showToast('Error disconnecting from WhatsApp', 'error');
        } finally {
            hideLoading();
        }
    }

    async function clearSession() {
        try {
            if (!confirm('Clear session akan menghapus semua data login WhatsApp. Anda perlu login ulang. Lanjutkan?')) {
                return;
            }

            showLoading();
            showToast('Clearing session...', 'info');
            
            const response = await $.post('/api/clear-session');
            
            if (response.success) {
                showToast('Session cleared successfully. Please reconnect.', 'success');
                updateConnectionStatus('disconnected');
                hideQRCode();
                hideConnectionSuccess();
            } else {
                showToast(response.message || 'Failed to clear session', 'error');
            }
        } catch (error) {
            console.error('Error clearing session:', error);
            showToast('Error clearing session', 'error');
        } finally {
            hideLoading();
        }
    }

    function showQRCode(qrData) {
        $('#qr-container').show();
        $('#connection-info').hide();
        
        // Clear previous QR code
        $('#qr-code').empty();
        
        // Check if qrData is a data URL or raw string
        if (qrData.startsWith('data:image')) {
            // Display as image if it's a data URL
            const img = $('<img>')
                .attr('src', qrData)
                .css({
                    'max-width': '256px',
                    'height': 'auto',
                    'border-radius': '10px'
                });
            $('#qr-code').append(img);
        } else {
            // Generate QR code from raw string (fallback)
            QRCode.toCanvas(document.getElementById('qr-code'), qrData, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            }, function(error) {
                if (error) {
                    console.error('Error generating QR code:', error);
                    showToast('Error generating QR code', 'error');
                }
            });
        }
    }

    function hideQRCode() {
        $('#qr-container').hide();
        $('#qr-code').empty();
    }

    function showConnectionSuccess() {
        $('#connection-info').show();
        $('#qr-container').hide();
    }

    function hideConnectionSuccess() {
        $('#connection-info').hide();
    }

    function showLoading() {
        $('#loading-overlay').show();
    }

    function hideLoading() {
        $('#loading-overlay').hide();
    }

    // Tambahkan event listener untuk tombol kirim
    setupSendListeners();

    // Jabber Functions
    let jabberStatus = 'disconnected';

    async function checkJabberStatus() {
        try {
            const response = await $.get('/api/jabber/status');
            updateJabberStatus(response.status);
            
            if (response.config) {
                $('#jabber-server').val(response.config.server);
                $('#jabber-port').val(response.config.port);
                $('#jabber-username').val(response.config.username);
                $('#jabber-target').val(response.config.targetJID);
                // Also load target JID to transaction form
                $('#jabber-target-jid').val(response.config.targetJID);
            }
        } catch (error) {
            console.error('Error checking Jabber status:', error);
            showToast('Error checking Jabber connection status', 'error');
        }
    }

    function updateJabberStatus(status) {
        jabberStatus = status;
        
        switch(status) {
            case 'connected':
                $('#jabber-connect-btn').prop('disabled', true);
                $('#jabber-disconnect-btn').prop('disabled', false);
                $('#jabber-test-btn').prop('disabled', false);
                $('#jabber-connection-info').show();
                $('#jabber-transaction-controls').show();
                $('#jabber-server-info').text($('#jabber-server').val());
                $('#jabber-user-info').text($('#jabber-username').val());
                showToast('Jabber connected successfully!', 'success');
                break;
            case 'connecting':
                $('#jabber-connect-btn').prop('disabled', true);
                $('#jabber-disconnect-btn').prop('disabled', false);
                $('#jabber-test-btn').prop('disabled', true);
                $('#jabber-connection-info').hide();
                $('#jabber-transaction-controls').hide();
                break;
            default:
                $('#jabber-connect-btn').prop('disabled', false);
                $('#jabber-disconnect-btn').prop('disabled', true);
                $('#jabber-test-btn').prop('disabled', true);
                $('#jabber-connection-info').hide();
                $('#jabber-transaction-controls').hide();
        }
    }

    async function connectToJabber() {
        try {
            const server = $('#jabber-server').val().trim();
            const port = parseInt($('#jabber-port').val()) || 5222;
            const username = $('#jabber-username').val().trim();
            const password = $('#jabber-password').val().trim();
            const targetJID = $('#jabber-target').val().trim();
            const ignoreSSL = $('#jabber-ignore-ssl').is(':checked');

            if (!server || !username || !password) {
                showToast('Please fill in server, username, and password', 'error');
                return;
            }

            showLoading();
            updateJabberStatus('connecting');

            const response = await $.ajax({
                url: '/api/jabber/connect',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    server,
                    port,
                    username,
                    password,
                    targetJID,
                    ignoreSSL
                })
            });

            if (response.success) {
                // Start polling for connection status
                setTimeout(() => {
                    checkJabberStatus();
                }, 2000);
                showToast('Jabber connection initiated...', 'info');
            } else {
                updateJabberStatus('disconnected');
                showToast(response.message || 'Failed to connect to Jabber', 'error');
            }
        } catch (error) {
            console.error('Error connecting to Jabber:', error);
            updateJabberStatus('disconnected');
            showToast(error.responseJSON?.message || 'Error connecting to Jabber', 'error');
        } finally {
            hideLoading();
        }
    }

    async function disconnectFromJabber() {
        try {
            showLoading();
            
            const response = await $.ajax({
                url: '/api/jabber/disconnect',
                method: 'POST'
            });

            if (response.success) {
                updateJabberStatus('disconnected');
                showToast('Jabber disconnected successfully', 'success');
            } else {
                showToast(response.message || 'Failed to disconnect from Jabber', 'error');
            }
        } catch (error) {
            console.error('Error disconnecting from Jabber:', error);
            showToast(error.responseJSON?.message || 'Error disconnecting from Jabber', 'error');
        } finally {
            hideLoading();
        }
    }

    async function clearJabberConfig() {
        try {
            if (!confirm('Clear saved Jabber configuration? You will need to enter credentials again after restart.')) {
                return;
            }

            showLoading();
            
            const response = await $.ajax({
                url: '/api/jabber/clear-config',
                method: 'POST'
            });

            if (response.success) {
                updateJabberStatus('disconnected');
                // Clear form fields
                $('#jabber-server').val('');
                $('#jabber-port').val('5222');
                $('#jabber-username').val('');
                $('#jabber-password').val('');
                $('#jabber-target').val('');
                showToast('Jabber configuration cleared successfully', 'success');
            } else {
                showToast(response.message || 'Failed to clear Jabber configuration', 'error');
            }
        } catch (error) {
            console.error('Error clearing Jabber config:', error);
            showToast(error.responseJSON?.message || 'Error clearing Jabber configuration', 'error');
        } finally {
            hideLoading();
        }
    }

    async function testJabberConnection() {
        try {
            if (jabberStatus !== 'connected') {
                showToast('Jabber not connected', 'error');
                return;
            }

            const targetJID = $('#jabber-target').val().trim();
            if (!targetJID) {
                showToast('Please enter target JID', 'error');
                return;
            }

            showLoading();

            const response = await $.ajax({
                url: '/api/jabber/test',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ targetJID })
            });

            if (response.success) {
                showToast(response.message, 'success');
            } else {
                showToast(response.message || 'Test failed', 'error');
            }
        } catch (error) {
            console.error('Error testing Jabber connection:', error);
            showToast(error.responseJSON?.message || 'Error testing connection', 'error');
        } finally {
            hideLoading();
        }
    }

    async function sendTransactionViaJabber() {
        try {
            if (jabberStatus !== 'connected') {
                showToast('Jabber not connected', 'error');
                return;
            }

            const targetJID = $('#jabber-target').val().trim();
            const transactionData = $('#jabber-transaction-data').val().trim();

            if (!targetJID) {
                showToast('Please enter target JID', 'error');
                return;
            }

            if (!transactionData) {
                showToast('Please enter transaction data', 'error');
                return;
            }

            showLoading();

            const response = await $.ajax({
                url: '/api/jabber/send-transaction',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    targetJID,
                    transactionData
                })
            });

            if (response.success) {
                showToast(response.message, 'success');
                $('#jabber-transaction-data').val(''); // Clear the textarea
            } else {
                showToast(response.message || 'Failed to send transaction', 'error');
            }
        } catch (error) {
            console.error('Error sending transaction via Jabber:', error);
            showToast(error.responseJSON?.message || 'Error sending transaction', 'error');
        } finally {
            hideLoading();
        }
    }

    function loadTransactionFromTable() {
        if (!transaksiData || transaksiData.length === 0) {
            showToast('No transaction data available. Please import Excel file first.', 'error');
            return;
        }

        // Get first few transactions and format them
        const transactionsToLoad = transaksiData.slice(0, 5); // Load first 5 transactions
        const formattedTransactions = transactionsToLoad.map(item => 
            `${item.kodeProduk}.${item.tujuan}.${item.nominal}.${item.pin}`
        ).join('\n');

        $('#jabber-transaction-data').val(formattedTransactions);
        showToast(`Loaded ${transactionsToLoad.length} transactions from table`, 'success');
    }

    // Handle send method change
    function handleSendMethodChange() {
        const selectedMethod = $('#send-method').val();
        
        // Hide all method configs first
        $('.method-config').hide();
        
        // Show the selected method config
        if (selectedMethod === 'whatsapp') {
            $('#whatsapp-config').show();
            $('#send-btn-text').text('Kirim ke WhatsApp');
            $('#target-number').prop('required', true);
            $('#jabber-target-jid').prop('required', false);
        } else if (selectedMethod === 'jabber') {
            $('#jabber-config').show();
            $('#send-btn-text').text('Kirim ke Jabber');
            $('#target-number').prop('required', false);
            $('#jabber-target-jid').prop('required', true);
        }
        
        // Update send info
        updateSendInfo();
    }

    function setupSendListeners() {
        // Tombol Kirim
        $(document).on('click', '#send-btn', sendTransactionData);
        
        // Tombol Reset Status
        $(document).on('click', '#reset-status-btn', resetTransactionStatus);
        
        // Update count selector saat data berubah
        $(document).on('transaksiDataUpdated', updateSendCount);
    }

    // Transaksi Functions
    let transaksiData = [];
    let sendingInProgress = false;

    function triggerFileInput() {
        $('#excel-file').click();
    }

    function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        showLoading();
        showImportInfo('Processing file...', 'info');

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: '' 
                });

                if (jsonData.length < 2) {
                    throw new Error('File Excel harus memiliki minimal 1 baris data (selain header)');
                }

                // Process data
                processExcelData(jsonData);
                
            } catch (error) {
                console.error('Error reading Excel file:', error);
                showImportInfo('Error: ' + error.message, 'error');
                showToast('Error membaca file Excel: ' + error.message, 'error');
            } finally {
                hideLoading();
                // Reset file input
                $('#excel-file').val('');
            }
        };

        reader.readAsArrayBuffer(file);
    }

    function processExcelData(jsonData) {
        try {
            // Skip header row (index 0)
            const dataRows = jsonData.slice(1);
            const processedData = [];

            dataRows.forEach((row, index) => {
                if (row.length >= 4 && row[0]) { // At least 4 columns and first column not empty
                    processedData.push({
                        kodeProduk: row[0] || '',
                        tujuan: row[1] || '',
                        nominal: row[2] || '',
                        pin: row[3] || '',
                        status: 'pending'
                    });
                }
            });

            if (processedData.length === 0) {
                throw new Error('Tidak ada data valid yang ditemukan dalam file Excel');
            }

            // Save to database first, then reload all data
            saveTransactionsToDatabase(processedData);
            
            showImportInfo(`Berhasil import ${processedData.length} data transaksi`, 'success');
            showToast(`Berhasil import ${processedData.length} data transaksi`, 'success');

        } catch (error) {
            console.error('Error processing Excel data:', error);
            showImportInfo('Error: ' + error.message, 'error');
            showToast('Error memproses data: ' + error.message, 'error');
        }
    }

    function displayTransaksiData() {
        const tbody = $('#transaksi-tbody');
        tbody.empty();

        if (transaksiData.length === 0) {
            $('#empty-state').show();
            $('.table-container').hide();
            $('.send-config').hide();
            return;
        }

        $('#empty-state').hide();
        $('.table-container').show();
        $('.send-config').show();

        transaksiData.forEach((item, index) => {
            const statusBadge = getStatusBadge(item.status || 'pending');
            const canResend = item.status === 'failed' || item.status === 'sent';
            const resendButton = canResend ? 
                `<button class="btn btn-info btn-sm resend-btn" data-index="${index}" title="Kirim Ulang">
                    <i class="fas fa-redo"></i>
                </button>` : '';
            
            const row = $(`
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(item.kodeProduk)}</td>
                    <td>${escapeHtml(item.tujuan)}</td>
                    <td>${escapeHtml(item.nominal)}</td>
                    <td>${escapeHtml(item.pin)}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            ${resendButton}
                            <button class="btn btn-warning btn-sm edit-btn" data-index="${index}" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-sm delete-btn" data-index="${index}" title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `);
            tbody.append(row);
        });

        // Bind action buttons
        $('.resend-btn').on('click', function() {
            const index = $(this).data('index');
            resendSingleTransaction(index);
        });

        $('.edit-btn').on('click', function() {
            const index = $(this).data('index');
            editTransaksi(index);
        });

        $('.delete-btn').on('click', function() {
            const index = $(this).data('index');
            deleteTransaksi(index);
        });
    }

    function loadTransaksiData() {
        // Load data from database
        loadTransactionsFromDatabase();
    }

    async function loadTransactionsFromDatabase() {
        try {
            showLoading();
            const response = await $.get('/api/transactions');
            
            if (response.success) {
                transaksiData = response.data.map(item => ({
                    id: item.id,
                    kodeProduk: item.kode_produk,
                    tujuan: item.tujuan,
                    nominal: item.nominal,
                    pin: item.pin,
                    status: item.status || 'pending'
                }));
                
                displayTransaksiData();
                if (transaksiData.length > 0) {
                    showImportInfo(`${transaksiData.length} data transaksi tersedia`, 'success');
                    updateSendCount();
                    updateSendInfo();
                } else {
                    showImportInfo('Belum ada data transaksi. Import file Excel untuk menambah data.', 'info');
                }
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
            showToast('Error memuat data transaksi', 'error');
        } finally {
            hideLoading();
        }
    }

    async function saveTransactionsToDatabase(transactions) {
        try {
            const response = await $.ajax({
                url: '/api/transactions/add',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ transactions })
            });
            
            if (response.success) {
                console.log('Transactions added to database');
                // Reload data to get updated list
                await loadTransactionsFromDatabase();
            }
        } catch (error) {
            console.error('Error saving transactions:', error);
            showToast('Error menyimpan data ke database', 'error');
        }
    }

    function clearTransaksiData() {
        if (transaksiData.length === 0) {
            showToast('Tidak ada data untuk dihapus', 'warning');
            return;
        }

        if (confirm('Apakah Anda yakin ingin menghapus semua data transaksi?')) {
            clearTransactionsFromDatabase();
        }
    }

    async function clearTransactionsFromDatabase() {
        try {
            showLoading();
            const response = await $.ajax({
                url: '/api/transactions',
                method: 'DELETE'
            });
            
            if (response.success) {
                transaksiData = [];
                displayTransaksiData();
                showImportInfo('Semua data transaksi telah dihapus', 'info');
                showToast('Data transaksi berhasil dihapus', 'success');
            }
        } catch (error) {
            console.error('Error clearing transactions:', error);
            showToast('Error menghapus data transaksi', 'error');
        } finally {
            hideLoading();
        }
    }

    async function editTransaksi(index) {
        const item = transaksiData[index];
        
        if (!item || !item.id) {
            showToast('Data transaksi tidak valid', 'error');
            return;
        }
        
        // For now, just show the data in a prompt (you can enhance this with a modal)
        const newKodeProduk = prompt('Kode Produk:', item.kodeProduk);
        if (newKodeProduk === null) return;

        const newTujuan = prompt('Tujuan:', item.tujuan);
        if (newTujuan === null) return;

        const newNominal = prompt('Nominal:', item.nominal);
        if (newNominal === null) return;

        const newPin = prompt('PIN:', item.pin);
        if (newPin === null) return;

        try {
            showLoading();
            
            // Update in database
            const response = await $.ajax({
                url: `/api/transactions/${item.id}`,
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({
                    kodeProduk: newKodeProduk,
                    tujuan: newTujuan,
                    nominal: newNominal,
                    pin: newPin
                })
            });
            
            if (response.success) {
                showToast('Data transaksi berhasil diupdate', 'success');
                // Reload data from database
                await loadTransactionsFromDatabase();
            } else {
                showToast('Error mengupdate data transaksi', 'error');
            }
        } catch (error) {
            console.error('Error updating transaction:', error);
            showToast('Error mengupdate data transaksi', 'error');
        } finally {
            hideLoading();
        }
    }

    async function deleteTransaksi(index) {
        const item = transaksiData[index];
        
        if (!item || !item.id) {
            showToast('Data transaksi tidak valid', 'error');
            return;
        }
        
        if (confirm('Apakah Anda yakin ingin menghapus data ini?')) {
            try {
                showLoading();
                
                // Delete from database
                const response = await $.ajax({
                    url: `/api/transactions/${item.id}`,
                    method: 'DELETE'
                });
                
                if (response.success) {
                    showToast('Data transaksi berhasil dihapus', 'success');
                    // Reload data from database
                    await loadTransactionsFromDatabase();
                } else {
                    showToast('Error menghapus data transaksi', 'error');
                }
            } catch (error) {
                console.error('Error deleting transaction:', error);
                showToast('Error menghapus data transaksi', 'error');
            } finally {
                hideLoading();
            }
        }
    }

    function showImportInfo(message, type = 'info') {
        const infoDiv = $('#import-info');
        const messageSpan = $('#import-message');
        
        infoDiv.removeClass('success error info').addClass(type);
        messageSpan.text(message);
        infoDiv.show();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, type = 'success') {
        const toastId = 'toast-' + Date.now();
        const toast = $(`
            <div id="${toastId}" class="toast ${type}">
                <div class="toast-header">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div class="toast-body">${message}</div>
            </div>
        `);
        
        $('#toast-container').append(toast);
        
        setTimeout(() => {
            toast.addClass('show');
        }, 100);
        
        setTimeout(() => {
            toast.removeClass('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    // WhatsApp Send Functions
    function updateSendCount() {
        const sendCountInput = $('#send-count');
        const maxCount = transaksiData.length;
        
        if (sendCountInput.length && maxCount > 0) {
            // Hitung data berdasarkan status
            const pendingCount = transaksiData.filter(item => item.status === 'pending').length;
            const sentCount = transaksiData.filter(item => item.status === 'sent').length;
            const failedCount = transaksiData.filter(item => item.status === 'failed').length;
            const unsentCount = pendingCount + failedCount;
            
            sendCountInput.attr('max', unsentCount > 0 ? unsentCount : maxCount);
            const currentValue = parseInt(sendCountInput.val()) || 1;
            
            if (unsentCount === 0) {
                sendCountInput.val(1);
            } else if (currentValue > unsentCount) {
                sendCountInput.val(unsentCount);
            }
            
            // Update info di bawah input
            const infoText = `Total: ${maxCount} | Pending: ${pendingCount} | Terkirim: ${sentCount} | Gagal: ${failedCount}`;
            $('#send-count').next('.form-text').html(`
                ${infoText}<br>
                <strong>Data yang akan dikirim: ${unsentCount > 0 ? 'Yang belum terkirim' : 'Semua sudah terkirim'}</strong>
            `);
            
            // Update send info
            updateSendInfo();
        }
    }

    function updateSendInfo() {
        const sendCountInput = $('#send-count');
        const targetNumber = $('#target-number').val().trim();
        const sendCount = parseInt(sendCountInput.val()) || 0;
        const sendDelay = parseInt($('#send-delay').val()) || 1000;
        const sendInfoEl = $('#send-info');
        const sendInfoText = $('#send-info-text');
        
        if (transaksiData.length === 0) {
            sendInfoEl.hide();
            return;
        }
        
        // Hitung data yang belum terkirim
        const unsentData = transaksiData.filter(item => 
            item.status === 'pending' || item.status === 'failed'
        );
        
        if (unsentData.length === 0) {
            sendInfoText.html('Semua data sudah terkirim');
            sendInfoEl.show();
            return;
        }
        
        const dataToSend = unsentData.slice(0, sendCount);
        const totalAmount = dataToSend.reduce((sum, item) => sum + parseFloat(item.nominal || 0), 0);
        
        // Hitung estimasi waktu total
        const totalTimeMs = dataToSend.length > 1 ? (dataToSend.length - 1) * sendDelay : 0;
        const minutes = Math.floor(totalTimeMs / 60000);
        const seconds = Math.floor((totalTimeMs % 60000) / 1000);
        const timeEstimate = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        
        if (targetNumber && sendCount > 0) {
            sendInfoText.html(`
                Akan mengirim ${dataToSend.length} data ke nomor ${targetNumber}<br>
                <small>Total nominal: Rp ${totalAmount.toLocaleString('id-ID')} | 
                Delay: ${sendDelay}ms | 
                Estimasi waktu: ${timeEstimate}</small>
            `);
        } else if (sendCount > 0) {
            sendInfoText.html(`
                ${dataToSend.length} data siap dikirim (masukkan nomor tujuan)<br>
                <small>Total nominal: Rp ${totalAmount.toLocaleString('id-ID')} | 
                Delay: ${sendDelay}ms | 
                Estimasi waktu: ${timeEstimate}</small>
            `);
        } else {
            sendInfoText.html('Pilih jumlah data yang akan dikirim');
        }
        
        sendInfoEl.show();
    }

    function getStatusBadge(status) {
        const badges = {
            'pending': '<span class="status-badge pending">Pending</span>',
            'sent': '<span class="status-badge sent">Terkirim</span>',
            'failed': '<span class="status-badge failed">Gagal</span>',
            'sending': '<span class="status-badge sending">Mengirim</span>'
        };
        return badges[status] || badges['pending'];
    }

    async function sendTransactionData() {
        if (sendingInProgress) {
            showToast('Pengiriman sedang berlangsung', 'warning');
            return;
        }

        // Ambil metode pengiriman
        const sendMethod = $('#send-method').val();
        
        // Validasi koneksi berdasarkan metode
        if (sendMethod === 'whatsapp') {
            if (currentStatus !== 'connected') {
                showToast('WhatsApp belum terkoneksi. Silakan koneksi terlebih dahulu.', 'error');
                return;
            }
        } else if (sendMethod === 'jabber') {
            if (jabberStatus !== 'connected') {
                showToast('Jabber belum terkoneksi. Silakan koneksi terlebih dahulu.', 'error');
                return;
            }
        }

        // Validasi data
        if (transaksiData.length === 0) {
            showToast('Tidak ada data transaksi untuk dikirim', 'warning');
            return;
        }

        // Ambil konfigurasi berdasarkan metode
        let targetDestination;
        if (sendMethod === 'whatsapp') {
            targetDestination = $('#target-number').val().trim();
            if (!targetDestination) {
                showToast('Nomor tujuan harus diisi', 'error');
                return;
            }
        } else if (sendMethod === 'jabber') {
            targetDestination = $('#jabber-target-jid').val().trim();
            if (!targetDestination) {
                showToast('Target JID harus diisi', 'error');
                return;
            }
        }

        const sendCount = parseInt($('#send-count').val());
        const sendDelay = parseInt($('#send-delay').val()) || 1000;

        // Validasi delay minimum
        if (sendDelay < 500) {
            showToast('Delay minimum adalah 500ms untuk menghindari spam', 'error');
            return;
        }

        // Validasi format nomor khusus untuk WhatsApp
        let normalizedDestination = targetDestination;
        if (sendMethod === 'whatsapp') {
            const phoneRegex = /^(\+62|62|0)[\d\s\-()]+$/;
            if (!phoneRegex.test(targetDestination)) {
                showToast('Format nomor tidak valid. Gunakan format: +62xxx atau 62xxx', 'error');
                return;
            }

            // Normalisasi nomor WhatsApp
            normalizedDestination = targetDestination.replace(/[\s\-()]/g, '');
            if (normalizedDestination.startsWith('0')) {
                normalizedDestination = '62' + normalizedDestination.slice(1);
            } else if (normalizedDestination.startsWith('+62')) {
                normalizedDestination = normalizedDestination.slice(1);
            }
        }

        // Cari data yang belum terkirim (status pending atau failed)
        const unsentData = transaksiData.filter(item => 
            item.status === 'pending' || item.status === 'failed'
        );

        if (unsentData.length === 0) {
            showToast('Semua data sudah terkirim', 'info');
            return;
        }

        // Ambil data yang akan dikirim berdasarkan sendCount
        // Jika sendCount lebih besar dari data yang belum terkirim, kirim semua yang belum terkirim
        const dataToSend = unsentData.slice(0, Math.min(sendCount, unsentData.length));
        
        // Konfirmasi berdasarkan metode
        const methodText = sendMethod === 'whatsapp' ? 'WhatsApp' : 'Jabber';
        const confirmMessage = `Kirim ${dataToSend.length} data transaksi yang belum terkirim via ${methodText} ke ${normalizedDestination}?\n\n` +
                              `Total belum terkirim: ${unsentData.length} data\n` +
                              `Akan dikirim: ${dataToSend.length} data`;
        
        if (!confirm(confirmMessage)) {
            return;
        }

        // Mulai pengiriman
        sendingInProgress = true;
        $('#send-btn').prop('disabled', true).text('Mengirim...');
        
        // Tambahkan progress bar setelah form konfigurasi
        const progressHtml = `
            <div class="progress-container" style="display: block;">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%;"></div>
                    <div class="progress-text">0/${dataToSend.length} (0%)</div>
                </div>
            </div>
        `;
        
        if ($('.progress-container').length === 0) {
            $('.send-config').after(progressHtml);
        } else {
            $('.progress-container').show();
        }

        let successCount = 0;
        let failedCount = 0;

        try {
            for (let i = 0; i < dataToSend.length; i++) {
                if (!sendingInProgress) {
                    // Jika dibatalkan
                    break;
                }

                const item = dataToSend[i];
                
                // Update status menjadi sending
                item.status = 'sending';
                displayTransaksiData();
                
                // Update status di database
                await updateTransactionStatusInDatabase(item.id, 'sending', normalizedDestination);

                // Format pesan
                const message = `${item.kodeProduk}.${item.tujuan}.${item.nominal}.${item.pin}`;

                try {
                    let response;
                    
                    // Kirim berdasarkan metode yang dipilih
                    if (sendMethod === 'whatsapp') {
                        response = await $.ajax({
                            url: '/api/send-message',
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify({
                                number: normalizedDestination,
                                message: message
                            })
                        });
                    } else if (sendMethod === 'jabber') {
                        response = await $.ajax({
                            url: '/api/jabber/send-transaction',
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify({
                                targetJID: normalizedDestination,
                                transactionData: message
                            })
                        });
                    }

                    if (response && response.success) {
                        item.status = 'sent';
                        successCount++;
                        await updateTransactionStatusInDatabase(item.id, 'sent', normalizedDestination);
                    } else {
                        item.status = 'failed';
                        failedCount++;
                        await updateTransactionStatusInDatabase(item.id, 'failed', normalizedDestination, response?.message || 'Send failed');
                    }
                } catch (error) {
                    console.error(`Error sending via ${sendMethod}:`, error);
                    item.status = 'failed';
                    failedCount++;
                    await updateTransactionStatusInDatabase(item.id, 'failed', normalizedDestination, error.responseJSON?.message || error.message);
                }

                // Update display
                displayTransaksiData();
                updateProgress(i + 1, dataToSend.length);

                // Delay antar pengiriman sesuai konfigurasi
                if (i < dataToSend.length - 1 && sendingInProgress) {
                    await new Promise(resolve => setTimeout(resolve, sendDelay));
                }
            }

            // Hitung data yang masih belum terkirim setelah proses selesai
            const remainingUnsent = transaksiData.filter(item => 
                item.status === 'pending' || item.status === 'failed'
            ).length;

            // Tampilkan hasil
            if (sendingInProgress) {
                const methodText = sendMethod === 'whatsapp' ? 'WhatsApp' : 'Jabber';
                const resultMessage = `Pengiriman via ${methodText} selesai. Berhasil: ${successCount}, Gagal: ${failedCount}` +
                                    (remainingUnsent > 0 ? `\nData yang belum terkirim: ${remainingUnsent}` : '\nSemua data sudah terkirim!');
                showToast(resultMessage, 'info');
            } else {
                showToast('Pengiriman dibatalkan', 'warning');
            }

        } catch (error) {
            console.error('Error in sending process:', error);
            showToast('Terjadi kesalahan saat mengirim data', 'error');
        } finally {
            // Reset UI
            sendingInProgress = false;
            const buttonText = sendMethod === 'whatsapp' ? 'Kirim ke WhatsApp' : 'Kirim ke Jabber';
            $('#send-btn').prop('disabled', false);
            $('#send-btn-text').text(buttonText.replace(/Kirim ke /, ''));
            hideProgress();
            
            // Update count dan info setelah pengiriman selesai
            updateSendCount();
            updateSendInfo();
        }
    }

    function resetTransactionStatus() {
        if (transaksiData.length === 0) {
            showToast('Tidak ada data transaksi', 'warning');
            return;
        }

        if (confirm('Reset status semua transaksi menjadi pending?')) {
            resetTransactionStatusInDatabase();
        }
    }

    async function resetTransactionStatusInDatabase() {
        try {
            showLoading();
            const response = await $.ajax({
                url: '/api/transactions/reset-status',
                method: 'PUT'
            });
            
            if (response.success) {
                // Reload data from database
                await loadTransactionsFromDatabase();
                showToast('Status transaksi berhasil direset', 'success');
            }
        } catch (error) {
            console.error('Error resetting transaction status:', error);
            showToast('Error mereset status transaksi', 'error');
        } finally {
            hideLoading();
        }
    }

    function cancelSending() {
        if (sendingInProgress) {
            sendingInProgress = false;
            showToast('Membatalkan pengiriman...', 'info');
        }
    }

    function showProgress(current, total) {
        const percentage = Math.round((current / total) * 100);
        const progressContainer = $('.progress-container');
        const progressFill = $('.progress-fill');
        const progressText = $('.progress-text');
        
        progressContainer.show();
        progressFill.css('width', percentage + '%');
        progressText.text(`${current}/${total} (${percentage}%)`);
    }

    function updateProgress(current, total) {
        showProgress(current, total);
    }

    function hideProgress() {
        $('.progress-container').hide();
    }

    async function updateTransactionStatusInDatabase(id, status, sentTo = null, errorMessage = null) {
        try {
            await $.ajax({
                url: `/api/transactions/${id}/status`,
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({
                    status: status,
                    sentTo: sentTo,
                    errorMessage: errorMessage
                })
            });
        } catch (error) {
            console.error('Error updating transaction status in database:', error);
        }
    }

    async function resendSingleTransaction(index) {
        const item = transaksiData[index];
        
        if (!item) {
            showToast('Data transaksi tidak ditemukan', 'error');
            return;
        }

        // Validasi koneksi WhatsApp
        if (currentStatus !== 'connected') {
            showToast('WhatsApp belum terkoneksi. Silakan koneksi terlebih dahulu.', 'error');
            return;
        }

        // Ambil nomor tujuan dari form input yang sudah ada
        const targetNumber = $('#target-number').val().trim();
        
        if (!targetNumber) {
            showToast('Masukkan nomor tujuan di form konfigurasi terlebih dahulu', 'error');
            return;
        }

        // Validasi format nomor
        const phoneRegex = /^(\+62|62|0)[\d\s\-()]+$/;
        if (!phoneRegex.test(targetNumber)) {
            showToast('Format nomor tidak valid. Gunakan format: +62xxx atau 62xxx', 'error');
            return;
        }

        // Normalisasi nomor
        let normalizedNumber = targetNumber.replace(/[\s\-()]/g, '');
        if (normalizedNumber.startsWith('0')) {
            normalizedNumber = '62' + normalizedNumber.slice(1);
        } else if (normalizedNumber.startsWith('+62')) {
            normalizedNumber = normalizedNumber.slice(1);
        }

        // Konfirmasi singkat - langsung kirim
        if (!confirm(`Kirim ulang transaksi "${item.kodeProduk}" ke ${normalizedNumber}?`)) {
            return;
        }

        try {
            // Update status menjadi sending
            item.status = 'sending';
            displayTransaksiData();
            await updateTransactionStatusInDatabase(item.id, 'sending', normalizedNumber);

            // Format pesan
            const message = `${item.kodeProduk}.${item.tujuan}.${item.nominal}.${item.pin}`;

            showToast('Mengirim ulang transaksi...', 'info');

            // Kirim pesan
            const response = await $.ajax({
                url: '/api/send-message',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    number: normalizedNumber,
                    message: message
                })
            });

            if (response.success) {
                item.status = 'sent';
                await updateTransactionStatusInDatabase(item.id, 'sent', normalizedNumber);
                showToast(`Transaksi "${item.kodeProduk}" berhasil dikirim ulang ke ${normalizedNumber}`, 'success');
            } else {
                item.status = 'failed';
                await updateTransactionStatusInDatabase(item.id, 'failed', normalizedNumber, response.message);
                showToast(`Gagal mengirim ulang: ${response.message}`, 'error');
            }
        } catch (error) {
            console.error('Error resending transaction:', error);
            item.status = 'failed';
            await updateTransactionStatusInDatabase(item.id, 'failed', normalizedNumber, error.responseJSON?.message || error.message);
            showToast(`Error mengirim ulang: ${error.responseJSON?.message || error.message}`, 'error');
        }

        // Update display dan info
        displayTransaksiData();
        updateSendCount();
        updateSendInfo();
    }

    // Cleanup on page unload
    $(window).on('beforeunload', function() {
        stopStatusPolling();
    });
});
