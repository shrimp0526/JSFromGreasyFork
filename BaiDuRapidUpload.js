// ==UserScript==
// @name              百度网盘秒传
// @version           1.2.8
// @description       提取百度网盘秒传链接，生成百度网盘秒传链接（失效）
// @match             *://pan.baidu.com/disk/home*
// @match             *://yun.baidu.com/disk/home*
// @require           https://cdn.jsdelivr.net/npm/sweetalert2@8
// @require           https://cdn.jsdelivr.net/npm/js-base64
// @require           https://cdn.staticfile.org/spark-md5/3.0.0/spark-md5.min.js
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_deleteValue
// @grant             GM_setClipboard
// @grant             GM_xmlhttpRequest
// @run-at            document-start
// @connect           *
// ==/UserScript==
(function () {
	'use strict';
	// Base64，https://gitee.com/mirrors/js-base64
	// Swal，https://sweetalert2.github.io/#usage
	// SparkMD5，https://github.com/satazor/js-spark-md5
	/* ClipboardJS，https://github.com/zenorocha/clipboard.js
		var button = document.createElement("button");
		var clipborad = new Clipboard(button);
		button.setAttribute("data-clipboard-text", "wait copy to clipborad content");
		button.click();//copy to clipborad
	*/
	const apiUrl = 'https://pan.baidu.com/api/list';
	const pcsUrl = 'https://pcs.baidu.com/rest/2.0/pcs/file';//个人云存储
	const appIDList = ['250528', '265486', '266719', '778750', '498065', '309847'];
	//使用'250528', '265486', '266719'，下载50M以上的文件会报403，黑号情况下部分文件也会报403
	const badMd5 = ['fcadf26fc508b8039bee8f0901d9c58e', '2d9a55b7d5fe70e74ce8c3b2be8f8e43'];
	const fetchBtnHtml =
		`<a class="g-button g-button-blue" href="javascript:;" id="fetchBtn" title="秒传链接" style="display: inline-block;"">
	        <span class="g-button-right"><em class="icon icon-disk" title="秒传链接提取"></em><span class="text" style="width:auto;">秒传链接</span></span>
	    </a>`;
	const genBtnHtml =
		`<a class="g-button generate-button">
	        <span class="g-button-right"><em class="icon icon-share" title="生成秒传"></em><span class="text">生成秒传</span></span>
	    </a>`;
	const checkBtnHtml =
		`<p style="width:100%; height:34px; display:block; line-height:34px; text-align:center;">
	        测试秒传, 可防止秒传失效<a class="g-button g-button-blue" id="checkBtn"><span class="g-button-right"><span class="text" style="width:auto;">测试</span></span></a>
	    </p>
	    <p>注意: 测试秒传会转存并覆盖文件,若在生成期间修改过同名文件,为避免修改的文件丢失,请不要使用此功能!</p>`;
	const updateInfo =
		`<p>优化按钮样式，添加了md5获取失败的报错</p>
	    <p>修复从pan.baidu.com进入后不显示生成按钮的问题</p>
	    <p>若出现任何问题请前往<a href="https://greasyfork.org/zh-CN/scripts/397324/feedback" rel="noopener noreferrer" target="_blank">greasyfork页</a>反馈</p>
	    <p><br></p>
	    <p>1.2.4 更新内容(20.11.2):</p>
	    <p>新增生成秒传:</p>
	    <p>选择文件或文件夹后点击 "生成秒传" 即可开始生成</p>
	    <p><br></p>
	    <p>继续未完成任务:</p>
	    <p>若生成秒传期间关闭了网页, 再次点击 "生成秒传" 即可继续任务</p>
	    <p><br></p>
	    <p>测试秒传功能:</p>
	    <p>生成完成后, 点击"测试"按钮, 会自动转存并覆盖文件(文件内容不变), 以检测秒传有效性, 以及修复md5错误防止秒传失效</p>`;


	let toHex = number => ('0' + number.toString(16)).slice(-2);

	function sleep(time) {
		var startTime = new Date().getTime() + parseInt(time, 10);
		while (new Date().getTime() < startTime) {
		}
	}

	/**
	 * 一个简单的类似于 NodeJS Buffer 的实现.
	 * 用于解析游侠度娘提取码。
	 */
	function SimpleBuffer(str) {
		this.fromString(str);
	}

	SimpleBuffer.prototype.fromString = function (str) {
		var len = str.length;
		this.buf = new Uint8Array(len);//ES2017，8位无符号整型数组
		for (var i = 0; i < len; i++) {
			this.buf[i] = str.charCodeAt(i);
		}
	};
	SimpleBuffer.prototype.readNumber = function (index, size) {
		var r = 0;
		for (var i = index + size; i > index;) {
			r = this.buf[--i] + (r * 256);
		}
		return r;
	};
	SimpleBuffer.prototype.readInt = function (index) {
		return this.readNumber(index, 4);
	};
	SimpleBuffer.prototype.readLong = function (index) {
		return this.readNumber(index, 8);
	};
	SimpleBuffer.prototype.readHex = function (index, size) {
		return Array.prototype.slice.call(this.buf, index, index + size).map(toHex).join('');
	};
	SimpleBuffer.prototype.readUnicode = function (index, size) {
		if (size & 1) {
			size++;
		}
		var hexArray = Array.prototype.slice.call(this.buf, index, index + size).map(toHex);
		var r = [''];//join时第一个字符前加\u
		for (var i = 0; i < size; i += 2) {
			r.push(hexArray[i + 1] + hexArray[i]);
		}
		return JSON.parse('"' + r.join('\\u') + '"');
	};

	function StdCodeGenerator() {
	}

	/**
	 * @param infos 待处理的文件信息数组，[{path,size,errno}]
	 * @param index 待处理的文件信息索引
	 */
	function generateStdCode(infos, index) {
		Swal.fire({
			title: '秒传生成中',
			allowOutsideClick: false,
			html: '<p>正在生成第 <index></index> 个</p><p><progress></progress></p>',
			onBeforeOpen: () => {
				Swal.showLoading();
				var content = Swal.getContent();
				generateProcess(infos, index, content.querySelector('index'), content.querySelector('progress'));
			}
		});
	}

	/**
	 *
	 * @param infos 待处理的文件信息数组，[{path,size,contentMd5,sliceMd5,errno}]
	 * @param index 待处理的文件信息索引
	 * @param indexElem 显示索引的元素
	 * @param progressElem 显示进度的元素
	 * @param appIDIndex app ID的索引
	 * @param initAppID 初始化AppID
	 */
	function generateProcess(infos, index, indexElem, progressElem, appIDIndex = 0, initAppID = true) {
		if (index >= infos.length) {
			var failInfo = '';
			var failCount = 0;
			var successInfos = [];
			var stdCode = '';
			infos.forEach(function (item) {
				if (item.hasOwnProperty('errno')) {
					failCount++;
					failInfo += `<p>文件：${item.path}</p><p>失败原因：${getErrorDesc(item.errno)}(#${item.errno})</p>`;
				} else {
					successInfos.push(item);
					stdCode += `${item.md5}#${item.md5s}#${item.size}#${item.path}\n`;
				}
			});
			stdCode = stdCode.trim();
			if (failInfo) {
				failInfo = '<p><br></p><p>失败文件列表:</p>' + failInfo;
			}
			GM_deleteValue('UnfinishedJob');
			Swal.fire({
				title: `生成完毕 共${infos.length}个, 失败${failCount}个!`,
				confirmButtonText: '复制秒传代码',
				showCloseButton: true,
				allowOutsideClick: false,
				html: checkBtnHtml + failInfo,
				onBeforeOpen: () => {
					$("#checkBtn").click(function () {
						informal(successInfos);
					});
				}
			}).then((result) => {
				if (result.value) {
					GM_setClipboard(stdCode);
				}
			});
			return;
		}
		// 记录处理进度
		GM_setValue('UnfinishedJob', {
			'infos': infos,
			'index': index
		});
		var info = infos[index];
		if (info.hasOwnProperty('errno')) {
			// 不正确的文件信息，进行下一个操作
			generateProcess(infos, index + 1, indexElem, progressElem);
			return;
		}
		indexElem.textContent = (index + 1).toString() + ' / ' + infos.length.toString();
		progressElem.textContent = "0%";

		var sliceSize = info.size < 262144 ? info.size - 1 : 262143;
		// app ID初始化
		if (!initAppID) {
			appIDIndex = info.size < 50000000 ? 0 : 3;
		}

		GM_xmlhttpRequest({
			url: pcsUrl + `?app_id=${appIDList[appIDIndex]}&method=download&path=${encodeURIComponent(info.path)}`,
			type: 'GET',
			headers: {
				'Range': `bytes=0-${sliceSize}`
			},
			responseType: 'arraybuffer',
			onprogress: (r) => progressElem.textContent = `${parseInt((r.loaded / r.total) * 100)}%`,
			onerror: function (r) {
				info.errno = 114514;
				generateProcess(infos, index + 1, indexElem, progressElem);
			},
			onload: function (r) {
				if (parseInt(r.status / 100) === 2) {//响应状态是2xx
					var matches = r.responseHeaders.match(/content-md5: ([\da-f]{32})/);
					if (matches === null) info.errno = 996;
					else {
						var contentMd5 = matches[1];
						//bad_md5内的两个md5是和谐文件返回的，第一个是txt格式的"温馨提示.txt"，第二个是视频格式的（俗称5s）
						if (badMd5.indexOf(contentMd5) !== -1) info.errno = 1919;
						else {
							var sliceMd5 = new SparkMD5.ArrayBuffer()
								.append(r.response)
								.end();
							info.contentMd5 = contentMd5;
							info.sliceMd5 = sliceMd5;
							sleep(1000);
						}
					}
					generateProcess(infos, index + 1, indexElem, progressElem);
				} else {
					if (r.status == 403 && appIDIndex < appIDList.length - 1) {
						// 换app ID重试
						generateProcess(infos, index, appIDIndex + 1, false);
					} else {
						info.errno = r.status;
						generateProcess(infos, index + 1, indexElem, progressElem);
					}
				}
			}
		});
	}


	/**
	 * 解析称传标准码
	 * @param stdCode
	 * @returns {[{contentMd5,sliceMd5,size,path,errno}],ver,failed}
	 */
	function parseStdCode(stdCode) {
		var r;
		if (stdCode.indexOf('bdpan') === 0) {
			r = one(stdCode);
			r.ver = 'PanDL';
		} else if (stdCode.indexOf('BDLINK') === 0) {
			r = two(stdCode);
			r.ver = '游侠 v1';
		} else if (stdCode.indexOf('BaiduPCS-Go') === 0) {
			r = three(stdCode);
			r.ver = 'PCS-Go';
		} else {
			r = four(stdCode);
			r.ver = '梦姬标准';
		}
		return r;
	}

	function one(stdCode) {
		return stdCode.replace(/\s*bdpan:\/\//g, ' ').trim().split(' ').map(function (z) {
			return z.trim().fromBase64().match(/([\s\S]+)\|([\d]{1,20})\|([\da-f]{32})\|([\da-f]{32})/);
		}).filter(function (z) {
			return z;
		}).map(function (info) {
			return {
				contentMd5: info[3].toLowerCase(),
				sliceMd5: info[4].toLowerCase(),
				size: info[2],
				path: info[1]
			};
		});
	}

	function two(stdCode) {
		var raw = atob(stdCode.slice(6).replace(/\s/g, ''));
		if (raw.slice(0, 5) !== 'BDFS\x00') return null;
		var buffer = new SimpleBuffer(raw);
		var total = buffer.readInt(5);
		var index = 9;
		var infos = [];
		for (var i = 0; i < total; i++) {
			// 大小 (8 bytes)
			// contentMd5 + sliceMd5 (0x20)
			// nameSize (4 bytes)
			// name (unicode)
			var info = {};
			info.size = buffer.readLong(index + 0);
			info.contentMd5 = buffer.readHex(index + 8, 0x10);
			info.sliceMd5 = buffer.readHex(index + 0x18, 0x10);
			var nameSize = buffer.readInt(index + 0x28) << 1;
			info.path = buffer.readUnicode(index += 0x2C, nameSize);
			infos.push(info);
			index += nameSize;
		}
		return infos;
	}

	function three(stdCode) {
		return stdCode.split('\n').map(function (z) {
			// unsigned long long: 0~18446744073709551615
			return z.trim().match(/-length=([\d]{1,20}) -md5=([\da-f]{32}) -slicemd5=([\da-f]{32})[\s\S]+"([\s\S]+)"/);
		}).filter(function (z) {
			return z;
		}).map(function (info) {
			return {
				contentMd5: info[2],
				sliceMd5: info[3],
				size: info[1],
				path: info[4]
			};
		});
	}

	function four(stdCode) {
		return stdCode.split('\n').map(function (z) {
			// unsigned long long: 0~18446744073709551615
			return z.trim().match(/([\dA-Fa-f]{32})#([\dA-Fa-f]{32})#([\d]{1,20})#([\s\S]+)/);
		}).filter(function (z) {
			return z;
		}).map(function (info) {
			return {
				contentMd5: info[1].toLowerCase(),
				sliceMd5: info[2].toLowerCase(),
				size: info[3],
				path: info[4]
			};
		});
	}

	function getErrorDesc(errno) {
		switch (errno) {
			case -8:
				return '文件已存在';
			case 403:
				return '文件获取失败';
			case 404:
				return '文件不存在(秒传无效)';
			case 2:
				return '转存失败(重新登录/检查保存路径)';
			case -10:
				return '网盘容量已满';
			case 114514:
				return '接口调用失败(请重试)';
			case 1919:
				return '文件已被和谐';
			case 810:
				return '文件列表获取失败(请重试)';
			case 996:
				return 'md5获取失败(请等待一段时间再重试)';
			default:
				return '未知错误';
		}
	}

	/**
	 *
	 * @param dir 目录
	 * @param infos 标准码信息数组
	 * @param index 标准码信息索引
	 * @param numberElem 显示操作结果的元素
	 * @param checkFlag true→测试，false→正式
	 * @param upperFlag 标识操作使用大写的MD5值
	 */
	function saveFile(dir, infos, index, numberElem, checkFlag, upperFlag) {
		if (index >= infos.length) {//所有标准码都已处理
			Swal.fire({
				title: `${checkFlag ? '测试' : '转存'}完毕 共${infos.length}个 失败${infos.failed}个!`,
				confirmButtonText: checkFlag ? '复制秒传代码' : '确定',
				showCloseButton: true,
				html: '',
				onBeforeOpen: () => {
					var content = Swal.getContent();
					infos.forEach(function (info) {
						if (info.hasOwnProperty('errno')) {
							var p1 = document.createElement('p');
							var p2 = document.createElement('p');
							p1.appendChild(document.createTextNode(`文件名：${info.path}`));
							p2.appendChild(document.createTextNode(`失败原因：${(getErrorDesc(info.errno))}(#${info.errno})`));
							content.appendChild(p1);
							content.appendChild(p2);
						}
					});
					if (!checkFlag) {
						const _dir = dir.length === 1 ? dir : dir.replace(/\/$/, '');//路径以"/"结尾，去掉结尾的"/"
						const href = `${location.origin}/disk/home?#/all?vmode=list&path=${encodeURIComponent(_dir)}`;
						if (location.href !== href) {
							const confirmBtn = Swal.getConfirmButton();
							const openBtn = confirmBtn.cloneNode();
							openBtn.textContent = '打开目录';
							openBtn.style.backgroundColor = '#ecae3c';
							openBtn.onclick = () => {//目录跳转功能
								location.href = href;
								Swal.close();
							};
							confirmBtn.before(openBtn);
						}
					}
				}
			}).then((result) => {
				if (checkFlag) {
					if (result.value) {
						GM_setClipboard(stdCod);
					}
				}
				require('system-core:system/baseService/message/message.js').trigger('system-refresh');
			});
			infos.failed = 0;
			return;
		}
		var absentFlag = false;
		var info = infos[index];
		numberElem.textContent = (index + 1).toString() + ' / ' + infos;
		$.ajax({
			url: `/api/rapidupload${checkFlag ? '?rtype=3' : ''}`,
			type: 'POST',
			data: {
				path: dir + info.path,
				'content-md5': upperFlag ? info.md5.toUpperCase() : info.md5,
				'slice-md5': upperFlag ? info.md5s.toUpperCase() : info.md5s,
				'content-length': info.size
			}
		}).success(function (r) {
			if (r && r.errno) {
				if (!upperFlag && r.errno === 404) {
					absentFlag = true;
				} else {
					info.errno = r.errno;
					infos.failed++;
				}
			}
		}).fail(function (r) {
			info.errno = 114514;
			infos.failed++;
		}).always(function () {
			if (!upperFlag && absentFlag) {
				// try UpperCase md5
				saveFile(dir, infos, index, numberElem, checkFlag, true);
			} else {
				saveFile(dir, infos, index + 1, numberElem, checkFlag, false);
			}
		});
	}

	/**
	 *
	 * @param dir 目录
	 * @param infos 秒传信息
	 * @param checkFlag true→测试，false→正式
	 */
	function saveAlert(dir, infos, checkFlag) {
		Swal.fire({
			title: `文件${checkFlag ? '测试' : '提取'}中`,
			html: `正在${checkFlag ? '测试' : '转存'}第 <fileNum></fileNum> 个`,
			allowOutsideClick: false,
			onBeforeOpen: () => {
				Swal.showLoading();
				saveFile(dir, infos, 0, Swal.getContent().querySelector('fileNum'), checkFlag, false);
			}
		});
	}

	/**
	 *
	 * @param infos
	 */
	function informal(infos) {
		saveAlert('', infos, true);
	}

	function formal(infos) {
		var dir = GM_getValue('LastSavePath') || '';
		Swal.fire({
			title: '请输入保存路径',
			text: '不要填写例如D:\\GTA5这种本地路径!',
			input: 'text',
			inputPlaceholder: '格式示例：/GTA5/，默认保存在根目录',
			inputValue: dir,
			showCancelButton: true,
			confirmButtonText: '确定',
			cancelButtonText: '取消',
		}).then((result) => {
			if (!result.dismiss) {
				dir = result.value;
				if (dir.charAt(dir.length - 1) !== '/') dir += '/';
				GM_setValue('LastSavePath', dir);
				saveAlert(dir, infos, false);
			}
		});
	}

	function getInfo(content = '') {
		var infos;
		Swal.fire({
			title: '请输入提取码',
			input: 'textarea',
			inputValue: content,
			showCancelButton: true,
			inputPlaceholder: '[支持 PanDL/梦姬/游侠/PCS-Go][支持批量]',
			confirmButtonText: '确定',
			cancelButtonText: '取消',
			inputValidator: (value) => {
				if (!value) return '链接不能为空';
				infos = parseStdCode(value);
				if (!infos.length) return '未识别到正确的链接';
			}
		}).then((result) => {
			if (result.value) {
				formal(infos, false);
			}
		});
	}

	/**
	 * URL中包含标识符（bdlink）从URL中获取标准码
	 */
	function getInfoByUrl() {
		var url = window.location.href.match(/[\?#]bdlink=([\da-zA-Z/\+]+)&?/);
		if (url) {
			getInfo(url[1].fromBase64());
		} else if (!GM_getValue('ProficientInTool')) {
			Swal.fire({
				title: `秒传链接提取 1.2.5 更新内容(20.11.4):`,
				html: updateInfo,
				allowOutsideClick: false,
				confirmButtonText: '确定'
			}).then((result) => {
				GM_setValue("ProficientInTool", true);
			});
		}
	}

	let findSelected = () => require('system-core:context/context.js').instanceForSystem.list.getSelected();

	/**
	 * @param dirs 目录路径数组，[path]
	 * @param index 待处理目录路径索引
	 * @param infos 待处理的文件信息，[{path,size,errno}]
	 * @param pathElem 显示操作结果的元素
	 * @param recursive 是否递归
	 * @param selected dirs下的文件及目录，[{path,size,isdir}]
	 */
	function directory(dirs, index, infos, pathElem, recursive, selected = []) {
		if (index >= dirs.length) {
			generate(selected, false, pathElem, recursive, infos);
			return;
		}
		var dir = dirs[index];
		pathElem.textContent = dir;
		GM_xmlhttpRequest({//根据目录获取文件列表
			url: api_url + `?app_id=250528&dir=${encodeURIComponent(dir)}&num=0`,
			type: 'GET',
			responseType: 'json',
			onload: function (r) {
				if (!r.response.errno) {//有响应无错误码
					selected = selected.concat(r.response.list);
				} else {//有响应有错误码
					infos.push({
						'path': dir,
						'errno': 810
					});
				}
				directory(dirs, index + 1, infos, pathElem, recursive, selected);
			},
			onerror: function (r) {
				infos.push({//无响应
					'path': dir,
					'errno': 114514
				});
				directory(dirs, index + 1, infos, pathElem, recursive, selected);
			}
		});
	}

	/**
	 * 生成秒传标准码
	 * @param selected 文件数组，[{path,size,isdir}]
	 * @param first true→initGenBtnEvent，false→directory
	 * @param infos 待处理的文件信息，[{path,size,errno}]
	 * @param pathElem directory，显示操作结果的元素
	 * @param recursive directory，是否递归
	 */
	function generate(selected, first, pathElem, recursive, infos = []) {
		var dirs = [];
		selected.forEach(function (item) {
			if (item.isdir) {
				dirs.push(item.path);
			} else {
				infos.push({
					'path': item.path,
					'size': item.size,
				});
			}
		});
		if (dirs.length) {// 有目录
			if (first) {// initGenBtnEvent
				Swal.fire({
					type: 'info',
					title: '选择中包含文件夹, 是否递归生成?',
					text: '若选是，将同时生成各级子文件夹下的文件',
					allowOutsideClick: false,
					focusCancel: true,
					showCancelButton: true,
					reverseButtons: true,
					showCloseButton: true,
					confirmButtonText: '是',
					cancelButtonText: '否',
				}).then((result) => {
					if (result.value) {
						recursive = true;
					} else if (result.dismiss === Swal.DismissReason.cancel) {
						recursive = false;
					} else {
						return;
					}
					/*
					是，递归，处理选中目录下的文件与目录
					否，不递归，处理选中目录下的文件
					 */
					Swal.fire({
						title: '正在获取文件列表, 请稍等',
						html: '<p><dirPath></dirPath></p>',
						allowOutsideClick: false,
						onBeforeOpen: () => {
							Swal.showLoading();
							directory(dirs, 0, infos, Swal.getContent().querySelector('dirPath'), recursive);
						}
					});
				});
			} else if (recursive) {// 递归 && directory
				directory(dirs, 0, infos, pathElem, recursive);
			} else {// 非递归 && directory
				generateStdCode(infos, 0);
			}
		} else {
			generateStdCode(infos, 0);
		}
	}

	function initGenBtnEvent() {
		$(document).on("click", ".generate-button", function () {
			// 首次使用生成秒传码功能
			if (!GM_getValue("ProficientInGen")) {
				Swal.fire({
					title: '首次使用请注意',
					showCloseButton: true,
					allowOutsideClick: false,
					html: '<p>弹出跨域访问窗口时, 请选择 "总是允许全部域名"</p><img style="max-width: 100%; height: auto" src="https://i.loli.net/2020/11/01/U2kxfmnGlweqhbt.png">'
				}).then((result) => {
					if (result.value) {
						GM_setValue('ProficientInGen', true);
						generate(findSelected(), true);
					}
				});
				return;
			}
			// 存在未完成的生成秒传码任务
			if (GM_getValue('UnfinishedJob')) {
				Swal.fire({
					title: '检测到未完成的秒传任务',
					text: '是否继续进行？',
					showCancelButton: true,
					allowOutsideClick: false,
					confirmButtonText: '确定',
					cancelButtonText: '取消'
				}).then((result) => {
					if (result.value) {
						var unfinished = GM_getValue('UnfinishedJob');
						generateStdCode(unfinished.infos, unfinished.index);
					} else {
						GM_deleteValue('UnfinishedJob');
						generate(findSelected(), true);
					}
				});
			} else {
				generate(findSelected(), true);
			}
		});
	}

	function initGenBtn() {
		var listTools = require("system-core:context/context.js")
			.instanceForSystem
			.Broker
			.getButtonBroker("listTools");
		if (listTools && listTools.$box) {
			$(listTools.$box).children('div').after(genBtnHtml);
			initGenBtnEvent();
		} else {
			//延迟执行防listTools未渲染
			setTimeout(initGenBtn, 5000);
		}
	}

	//为String类型扩展方法
	if (Base64.extendString) {
		Base64.extendString();
	}
	let initFetchBtn = setInterval(() => {
		var div = $("div.tcuLAu");
		if (!!div.length) {
			div.append(fetchBtnHtml);
			$("#fetchBtn").click(() => getInfo());
			clearInterval(initFetchBtn);
		}
	}, 500);
	document.addEventListener('DOMContentLoaded', getInfoByUrl);
	document.addEventListener('DOMContentLoaded', initGenBtn);
})();
