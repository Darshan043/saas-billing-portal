export function emailLayout(options: {
  title: string;
  previewText?: string;
  bodyContent: string;
}): string {
  const preview = options.previewText
    ? `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.previewText}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .header {
      background-color: #0f172a;
      padding: 24px 32px;
      text-align: left;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.025em;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
      font-size: 15px;
    }
    .content h2 {
      margin-top: 0;
      margin-bottom: 16px;
      color: #0f172a;
      font-size: 18px;
      font-weight: 600;
    }
    .details-table {
      width: 100%;
      margin: 20px 0;
      border-collapse: collapse;
    }
    .details-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
    }
    .details-table td.label {
      color: #64748b;
      width: 40%;
      font-weight: 500;
    }
    .details-table td.value {
      color: #0f172a;
      font-weight: 600;
      text-align: right;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      background-color: #ecfdf5;
      color: #047857;
    }
    .footer {
      padding: 24px 32px;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  ${preview}
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>BillingHub</h1>
      </div>
      <div class="content">
        ${options.bodyContent}
      </div>
      <div class="footer">
        <p>This is an automated transactional message regarding your BillingHub account.<br>
        If you have any questions, please contact your account administrator.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

